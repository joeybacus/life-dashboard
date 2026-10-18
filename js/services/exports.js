/* Export data (0.9.0): Settings → Backup → Export data… — your information as
   files that open in Excel, Numbers or Google Sheets (CSV), and a printable
   workout summary (PDF). Sample data is never included. Times are Manila time,
   like the rest of the app.

     Tasks                 (the To Do export, todo/pages.js)
     Workouts              (Hevy's columns, workout/transfer.js)
     Weight & measurements every weigh-in and body measurement
     Habits                each habit on each day: due, done
     Focus sessions        start, end, minutes, task
     Exercise stats        per exercise: times done, heaviest, best estimated 1-rep max, volume
     Workout summary (PDF) a chosen period: totals, weeks, records, exercises, every workout */
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { db } from '../core/db.js';
import { state } from '../core/state.js';
import { actionSheet, openDialog, toast } from '../core/ui.js';
import { addDays, sheetTime, todayKey } from '../core/manila.js';
import { shareOrDownload } from './backup.js';
import { Pdf } from './pdf.js';
import { KINDS, valueOf } from '../modules/health/model.js';
import { loadHabits } from '../modules/habits/store.js';
import { dueOn, scheduleText } from '../modules/habits/model.js';
import { loadTodo } from '../modules/todo/store.js';
import { exportTasksCsv } from '../modules/todo/pages.js';
import { exportWorkoutsCsv } from '../modules/workout/transfer.js';
import {
  RANGES, between, buckets, computeRecords, finished, percentChange, rangeStart, recordTitle, recordValue, sessionNumbers, summarize,
} from '../modules/workout/analytics.js';
import { workoutDuration } from '../modules/workout/model.js';

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const live = (r) => r && !r.deletedAt && !r.sample;

function csvField(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`; // never run as a formula in Excel
  return /[",\n\r]/.test(text) || text === '' ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows as CSV (the mark at the start tells Excel it's UTF-8). */
export function toCsv(header, rows) {
  return `﻿${[header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n')}\r\n`;
}

const csvFile = (name, text) => new File([text], `LifeDashboard_${name}_${todayKey()}.csv`, { type: 'text/csv' });
const round = (n, d = 1) => (n == null ? '' : Math.round(n * 10 ** d) / 10 ** d);
const split = (iso) => { const t = sheetTime(iso); return [t.slice(0, 10), t.slice(11)]; };

/* ---------- The CSV files ---------- */

export async function measurementsCsv() {
  const rows = (await db.all('bodyMeasurements')).filter(live).sort((a, b) => String(a.measuredAt).localeCompare(String(b.measuredAt)));
  return {
    count: rows.length,
    file: csvFile('Weight-and-measurements', toCsv(['Date', 'Time', 'Measurement', 'Value', 'Unit', 'From', 'Note'],
      rows.map((r) => [...split(r.measuredAt), KINDS[r.kind]?.label ?? r.kind, round(valueOf(r), 2), KINDS[r.kind]?.unit ?? '',
        r.source === 'health' ? 'Apple Health' : 'Typed in', r.note ?? '']))),
  };
}

export async function habitsCsv() {
  const { habits, done } = await loadHabits();
  const list = habits.filter((h) => !h.sample);
  const today = todayKey();
  const rows = [];
  for (const h of list) {
    const days = done(h.id);
    const first = [todayKey(Date.parse(h.createdAt) || Date.now()), ...days].sort()[0];
    for (let d = first; d <= today && rows.length < 200_000; d = addDays(d, 1)) {
      const due = dueOn(h, days, d);
      const did = days.has(d);
      if (!due && !did) continue;
      rows.push([d, h.name, h.group, scheduleText(h.schedule), due ? 'Yes' : 'No', did ? 'Yes' : 'No']);
    }
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return { count: rows.length, habits: list.length, file: csvFile('Habits', toCsv(['Date', 'Habit', 'Group', 'Schedule', 'Due that day', 'Done'], rows)) };
}

export async function focusCsv() {
  const [sessions, todo] = await Promise.all([db.all('focusSessions'), loadTodo()]);
  const tasks = new Map(todo.tasks.map((t) => [t.id, t]));
  const rows = sessions.filter(live).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const TYPES = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  return {
    count: rows.length,
    file: csvFile('Focus-sessions', toCsv(['Date', 'Start', 'End', 'Minutes', 'Planned minutes', 'Type', 'Task', 'Category', 'Finished'],
      rows.map((s) => {
        const t = tasks.get(s.taskId);
        return [split(s.start)[0], split(s.start)[1], split(s.end)[1], s.minutes ?? '', s.plannedMinutes ?? '', TYPES[s.type] ?? s.type ?? 'Focus',
          t?.title ?? s.title ?? '', todo.categories.get(t?.categoryId)?.name ?? '', s.completed ? 'Yes' : 'No'];
      }))),
  };
}

/** Per exercise, from every finished workout. */
export function exerciseStats(workouts) {
  const by = new Map();
  for (const w of finished(workouts)) {
    const seen = new Set();
    for (const e of w.exercises) {
      const key = e.exerciseId || e.name;
      const sets = w.exercises.filter((x) => (x.exerciseId || x.name) === key).flatMap((x) => x.sets);
      if (seen.has(key) || !sets.some((s) => s.done)) continue;
      seen.add(key);
      const n = sessionNumbers(sets);
      const s = by.get(key) ?? { name: e.name, times: 0, sets: 0, reps: 0, volume: 0, weight: null, weightReps: null, e1rm: null, duration: null, distance: null, first: w.startedAt, last: w.startedAt };
      s.name = e.name || s.name;
      s.times++;
      s.sets += n.sets;
      s.reps += n.reps;
      s.volume += n.volume;
      if (n.weight != null && (s.weight == null || n.weight > s.weight || (n.weight === s.weight && (n.weightReps ?? 0) > (s.weightReps ?? 0)))) {
        s.weight = n.weight;
        s.weightReps = n.weightReps;
      }
      if (n.e1rm != null && (s.e1rm == null || n.e1rm > s.e1rm)) s.e1rm = n.e1rm;
      if (n.duration != null && (s.duration == null || n.duration > s.duration)) s.duration = n.duration;
      if (n.distance != null && (s.distance == null || n.distance > s.distance)) s.distance = n.distance;
      s.last = w.startedAt;
      by.set(key, s);
    }
  }
  return [...by.values()].sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
}

const clock = (sec) => (sec == null ? '' : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`);

export async function exerciseStatsCsv() {
  const stats = exerciseStats((await db.all('workouts')).filter(live));
  return {
    count: stats.length,
    file: csvFile('Exercise-stats', toCsv(['Exercise', 'Times done', 'Sets', 'Reps', 'Heaviest (kg)', 'Reps at heaviest', 'Best est. 1-rep max (kg)', 'Total volume (kg)',
      'Longest (min:sec)', 'Furthest (km)', 'First done', 'Last done'],
    stats.map((s) => [s.name, s.times, s.sets, s.reps, s.weight ?? '', s.weightReps ?? '', s.e1rm ?? '', Math.round(s.volume), clock(s.duration), s.distance ?? '',
      split(s.first)[0], split(s.last)[0]]))),
  };
}

/* ---------- Workout summary (PDF) ---------- */

const kg = (n) => `${Math.round(n).toLocaleString()} kg`;
const hours = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const BRAND = '#5563ff';
const INK = '#111827';
const MUTED = '#6b7280';
const RULE = '#dfe2ea';

/** A summary of the workouts in a range ('7', '30', '90', '182', '365', 'all') as a PDF file. */
export async function workoutSummaryPdf(range = '30', now = new Date()) {
  const all = (await db.all('workouts')).filter(live);
  const done = finished(all);
  const from = rangeStart(range, now);
  const inRange = between(done, from);
  const [, , longLabel] = RANGES.find(([v]) => v === range) ?? RANGES[1];
  const start = from ?? (inRange[0] ? new Date(inRange[0].startedAt) : now);
  const t = summarize(inRange);
  const before = from ? summarize(between(done, new Date(from.getTime() - (now - from)), from)) : null;
  const records = computeRecords(all).events.filter((e) => !from || new Date(e.date) >= from);
  const stats = exerciseStats(inRange);

  const doc = new Pdf({ title: `Workout summary · ${longLabel}` });
  const L = 48;
  const R = doc.width - 48;
  let y = 64;
  const ensure = (space) => {
    if (y + space <= doc.height - 56) return;
    doc.addPage();
    y = 56;
  };
  const heading = (text) => {
    ensure(90); // a heading never sits alone at the bottom of a page
    y += 14;
    doc.text(text, L, y, { size: 13, bold: true, color: INK });
    y += 8;
    doc.line(L, y, R, y, { color: RULE });
    y += 16;
  };

  // Title
  doc.rect(L, y - 20, 4, 26, { fill: BRAND });
  doc.text('Workout summary', L + 14, y, { size: 22, bold: true, color: INK });
  y += 20;
  doc.text(`${longLabel} · ${fmtDay.format(start)} – ${fmtDay.format(now)}`, L + 14, y, { size: 10.5, color: MUTED });
  doc.text([state.profile?.nickname, 'Life Dashboard'].filter(Boolean).join(' · '), R, y - 20, { size: 9, color: MUTED, align: 'right' });
  y += 28;

  if (!inRange.length) {
    doc.text('No finished workouts in this period.', L, y, { size: 12, color: MUTED });
    return { count: 0, file: doc.file(`LifeDashboard_Workout-summary_${todayKey()}.pdf`) };
  }

  // Totals, compared with the period before
  const tiles = [
    ['Workouts', String(t.count), before ? percentChange(before.count, t.count) : null],
    ['Active time', hours(t.time), before ? percentChange(before.time, t.time) : null],
    ['Sets', t.sets.toLocaleString(), before ? percentChange(before.sets, t.sets) : null],
    ['Reps', t.reps.toLocaleString(), before ? percentChange(before.reps, t.reps) : null],
    ['Volume', kg(t.volume), before ? percentChange(before.volume, t.volume) : null],
  ];
  const tw = (R - L - 4 * 8) / 5;
  tiles.forEach(([label, value, change], i) => {
    const x = L + i * (tw + 8);
    doc.rect(x, y, tw, 58, { fill: '#f3f4f8' });
    doc.text(label.toUpperCase(), x + 10, y + 16, { size: 7.5, bold: true, color: MUTED });
    doc.text(doc.fit(value, tw - 20, 15, true), x + 10, y + 36, { size: 15, bold: true, color: INK });
    if (change != null) doc.text(`${change > 0 ? '↑' : change < 0 ? '↓' : ''} ${Math.abs(change)}% vs before`, x + 10, y + 50, { size: 7.5, color: change >= 0 ? '#15803d' : '#b91c1c' });
  });
  y += 76;

  // Workouts per week
  const weeks = Math.min(26, Math.max(4, Math.ceil((now - start) / (7 * 864e5))));
  const bars = buckets(inRange, { unit: 'week', count: weeks, now });
  heading('Workouts per week');
  const max = Math.max(1, ...bars.map((b) => b.count ?? b.workouts ?? 0));
  const bw = (R - L) / bars.length;
  const chartH = 70;
  ensure(chartH + 30);
  bars.forEach((b, i) => {
    const n = b.count ?? b.workouts ?? 0;
    const h = (n / max) * chartH;
    const x = L + i * bw + bw * 0.18;
    if (n) doc.rect(x, y + chartH - h, bw * 0.64, h, { fill: BRAND });
    if (n) doc.text(String(n), x + bw * 0.32, y + chartH - h - 3, { size: 7, color: MUTED, align: 'center' });
    if (bars.length <= 13 || i % 2 === 0) doc.text(fmtShort.format(new Date(b.start ?? b.from ?? now)), x + bw * 0.32, y + chartH + 11, { size: 6.5, color: MUTED, align: 'center' });
  });
  doc.line(L, y + chartH, R, y + chartH, { color: RULE });
  y += chartH + 24;

  // What you trained
  const groups = new Map();
  inRange.forEach((w) => (w.muscleGroups?.length ? w.muscleGroups : ['Other']).forEach((g) => groups.set(g, (groups.get(g) ?? 0) + 1)));
  if (groups.size) {
    heading('What you trained');
    const line = [...groups].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${n}×`).join('   •   ');
    doc.wrap(line, R - L, 10).forEach((l) => { ensure(14); doc.text(l, L, y, { size: 10, color: INK }); y += 14; });
  }

  // Personal records
  if (records.length) {
    heading(`Personal records (${records.length})`);
    records.slice(-24).reverse().forEach((e) => {
      ensure(15);
      doc.text(fmtShort.format(new Date(e.date)), L, y, { size: 9, color: MUTED });
      doc.text(doc.fit(recordTitle(e), R - L - 170, 9.5), L + 52, y, { size: 9.5, color: INK });
      doc.text(recordValue(e), R, y, { size: 9.5, bold: true, color: INK, align: 'right' });
      y += 15;
    });
    if (records.length > 24) { doc.text(`…and ${records.length - 24} more`, L + 52, y, { size: 9, color: MUTED }); y += 15; }
  }

  // Exercises
  heading('Exercises');
  const cols = [[L, 'Exercise', 'left'], [L + 250, 'Times', 'right'], [L + 300, 'Sets', 'right'], [L + 390, 'Heaviest', 'right'], [L + 450, 'Est. 1RM', 'right'], [R, 'Volume', 'right']];
  const head = () => { cols.forEach(([x, label, align]) => doc.text(label.toUpperCase(), x, y, { size: 7.5, bold: true, color: MUTED, align })); y += 14; };
  head();
  stats.slice(0, 40).forEach((s) => {
    if (y + 15 > doc.height - 56) { doc.addPage(); y = 56; head(); }
    doc.text(doc.fit(s.name, 240, 9.5), L, y, { size: 9.5, color: INK });
    doc.text(String(s.times), L + 250, y, { size: 9.5, align: 'right' });
    doc.text(String(s.sets), L + 300, y, { size: 9.5, align: 'right' });
    doc.text(s.weight != null ? `${round(s.weight)} kg${s.weightReps ? ` × ${s.weightReps}` : ''}` : '—', L + 390, y, { size: 9.5, align: 'right' });
    doc.text(s.e1rm != null ? `${round(s.e1rm)} kg` : '—', L + 450, y, { size: 9.5, align: 'right' });
    doc.text(s.volume ? kg(s.volume) : '—', R, y, { size: 9.5, align: 'right' });
    y += 15;
  });

  // Every workout
  heading(`Every workout (${inRange.length})`);
  [...inRange].reverse().forEach((w) => {
    const s = summarize([w]);
    const names = w.exercises.filter((e) => e.sets.some((x) => x.done)).map((e) => {
      const n = sessionNumbers(e.sets);
      return n.weight != null ? `${e.name} ${round(n.weight)}×${n.weightReps ?? ''}` : e.name;
    });
    const lines = doc.wrap(names.join(' · ') || 'No sets logged', R - L - 12, 8.5);
    ensure(20 + lines.length * 11);
    doc.text(fmtDay.format(new Date(w.startedAt)), L, y, { size: 9, color: MUTED });
    doc.text(doc.fit(w.title || 'Workout', 230, 10.5, true), L + 110, y, { size: 10.5, bold: true, color: INK });
    doc.text(`${hours(workoutDuration(w))} · ${s.sets} sets · ${s.volume ? kg(s.volume) : '—'}`, R, y, { size: 9, color: MUTED, align: 'right' });
    y += 13;
    lines.forEach((l) => { doc.text(l, L + 12, y, { size: 8.5, color: '#374151' }); y += 11; });
    y += 6;
  });

  // Page numbers
  const total = doc.pages.length;
  doc.pages.forEach((ops, i) => {
    doc.ops = ops;
    doc.text(`Life Dashboard · Workout summary · page ${i + 1} of ${total}`, doc.width / 2, doc.height - 28, { size: 7.5, color: MUTED, align: 'center' });
  });
  return { count: inRange.length, file: doc.file(`LifeDashboard_Workout-summary_${todayKey()}.pdf`) };
}

/* ---------- Saving a file ---------- */

/** Hand the file over (share sheet on iPhone, Downloads elsewhere); iPhone sometimes wants one more tap. */
async function deliver(file, done) {
  const result = await shareOrDownload(file);
  if (result === 'downloaded') toast(`${done} Saved to your Downloads.`, { icon: 'download' });
  else if (result === 'shared') toast(done, { icon: 'share' });
  else if (result === 'needs-tap') {
    await openDialog({
      variant: 'alert',
      title: 'Your file is ready',
      body: html`<p class="dlg__msg">Tap Save, then choose where to keep it — for example “Save to Files”.</p>`,
      actions: [{ label: 'Cancel', value: 'cancel', variant: 'ghost' }, { label: 'Save', value: 'save', variant: 'primary' }],
      onOpen(dlg) {
        dlg.querySelector('[data-dialog-value="save"]').addEventListener('click', () => {
          navigator.share({ files: [file], title: file.name }).then(() => toast(done, { icon: 'share' })).catch(() => {});
        });
      },
    });
  }
}

const EXPORTS = [
  { value: 'tasks', label: 'Tasks (CSV)', icon: 'checklist', detail: 'Every task, with its day, time, category and notes' },
  { value: 'workouts', label: 'Workouts (CSV)', icon: 'dumbbell', detail: 'Every set, in Hevy’s columns (kg)' },
  { value: 'measurements', label: 'Weight & measurements (CSV)', icon: 'scale', detail: 'Weigh-ins and body measurements' },
  { value: 'habits', label: 'Habits (CSV)', icon: 'flame', detail: 'Each habit on each day: due, done' },
  { value: 'focus', label: 'Focus sessions (CSV)', icon: 'timer', detail: 'When, how long, which task' },
  { value: 'stats', label: 'Exercise stats (CSV)', icon: 'chart', detail: 'Times done, heaviest, best est. 1-rep max, volume' },
  { value: 'pdf', label: 'Workout summary (PDF)', icon: 'download', detail: 'A printable summary of a period you choose' },
];

const EMPTY = {
  measurements: 'There are no weigh-ins or measurements to export yet (sample data isn’t included).',
  habits: 'There are no habits to export yet.',
  focus: 'There are no focus sessions to export yet.',
  stats: 'There are no finished workouts to export yet (sample workouts aren’t included).',
};

/** Settings → Backup → Export data… */
export async function openExportData() {
  const choice = await openDialog({
    variant: 'sheet',
    className: 'action-sheet export-pick',
    title: 'Export data',
    body: html`<p class="dlg__msg">Spreadsheet files (CSV) open in Excel, Numbers or Google Sheets. Sample data isn’t included.</p>
      <div class="action-list">${EXPORTS.map((x) => html`<button type="button" class="action-item" data-dialog-value="${x.value}">
        ${icon(x.icon)}<span class="action-item__label">${x.label}</span><span class="action-item__detail">${x.detail}</span>
      </button>`)}</div>`,
    actions: [{ label: 'Close', value: '__close', variant: 'ghost' }],
  });
  if (!choice || choice === '__close') return;
  try {
    if (choice === 'tasks') return await exportTasksCsv();
    if (choice === 'workouts') return await exportWorkoutsCsv();
    if (choice === 'pdf') {
      const range = await actionSheet({
        title: 'Workout summary',
        message: 'Which period?',
        items: RANGES.map(([value, , label]) => ({ value, label, icon: 'calendar', checked: value === '30' })),
      });
      if (!range) return;
      const { count, file } = await workoutSummaryPdf(range);
      if (!count) toast('There are no finished workouts in that period — the PDF says so.', { icon: 'info' });
      return await deliver(file, `Workout summary saved (${plural(count, 'workout')}).`);
    }
    const make = { measurements: measurementsCsv, habits: habitsCsv, focus: focusCsv, stats: exerciseStatsCsv }[choice];
    const { count, file } = await make();
    if (!count) {
      toast(EMPTY[choice], { icon: 'info' });
      return;
    }
    const what = { measurements: 'entry', habits: 'habit day', focus: 'session', stats: 'exercise' }[choice];
    return await deliver(file, `Exported ${plural(count, what)}.`);
  } catch (err) {
    console.error(err);
    toast('That export didn’t work. Please try again.', { icon: 'info' });
  }
  return undefined;
}

