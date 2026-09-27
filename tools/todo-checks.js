/* Checks for the to-do logic (pure functions only — nothing is saved). Open
   tools/todo-checks.html through the preview server. Times are fixed moments,
   so the results don't depend on when or where the checks run. */
import { addDays, at, daysFrom, msUntilMidnight, todayKey, weekdayOf } from '../js/core/manila.js';
import {
  cleanUrl, dueAt, isOverdue, matchesTask, newTask, normalizeTask, overdueText, parseTags, possibleDuplicate, sortTasks,
  spokenRow, tasksToCsv, timeCell, viewCounts, viewGroups,
} from '../js/modules/todo/model.js';

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: ok ? '' : JSON.stringify(detail) });

/* ---------- Manila time ---------- */

// 2026-09-27 23:30 in Manila is 15:30 UTC; 00:30 the next day is 16:30 UTC
const lateEvening = Date.parse('2026-09-27T15:30:00Z');
const afterMidnight = Date.parse('2026-09-27T16:30:00Z');
check('Manila day at 11:30 PM', todayKey(lateEvening) === '2026-09-27', todayKey(lateEvening));
check('Manila day rolls over at midnight Manila time (not UTC)', todayKey(afterMidnight) === '2026-09-28', todayKey(afterMidnight));
check('30 minutes until Manila midnight at 11:30 PM', msUntilMidnight(lateEvening) === 30 * 60e3, msUntilMidnight(lateEvening));
check('a Manila date and time → the right moment', at('2026-09-27', '20:00').toISOString() === '2026-09-27T12:00:00.000Z', at('2026-09-27', '20:00'));
check('adding days crosses months', addDays('2026-09-30', 1) === '2026-10-01' && addDays('2026-03-01', -1) === '2026-02-28');
check('days between two dates', daysFrom('2026-09-25', '2026-09-27') === 2 && daysFrom('2026-09-27', '2026-09-25') === -2);
check('weekday of a date (Sunday = 0)', weekdayOf('2026-09-27') === 0 && weekdayOf('2026-09-28') === 1);

/* ---------- Due and overdue ---------- */

const T = (fields) => normalizeTask({ id: fields.id ?? `t${Math.random()}`, createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z', ...newTask(fields) });
const noon = Date.parse('2026-09-27T04:00:00Z'); // 12:00 in Manila
check('a task with no time is due at the end of its day', dueAt(T({ date: '2026-09-27' })).toISOString() === '2026-09-27T16:00:00.000Z');
check('…so it is not overdue at noon', !isOverdue(T({ date: '2026-09-27' }), noon));
check('…but is overdue after Manila midnight', isOverdue(T({ date: '2026-09-27' }), afterMidnight));
check('a timed task is overdue after its end time', isOverdue(T({ date: '2026-09-27', startTime: '10:00', endTime: '11:00' }), noon));
check('…and not before it', !isOverdue(T({ date: '2026-09-27', startTime: '13:00', endTime: '14:00' }), noon));
check('an 11 PM – 1 AM task ends the next day', dueAt(T({ date: '2026-09-27', startTime: '23:00', endTime: '01:00' })).toISOString() === '2026-09-27T17:00:00.000Z');
check('done and undated tasks are never overdue', !isOverdue(T({ date: '2026-09-20', status: 'done' }), noon) && !isOverdue(T({}), noon));
check('overdue wording', overdueText(T({ date: '2026-09-26' }), '2026-09-27') === 'Overdue · Yesterday' && overdueText(T({ date: '2026-09-24' }), '2026-09-27') === 'Overdue · 3 days');

/* ---------- Sorting ---------- */

const list = [
  T({ id: 'low-early', title: 'Low early', priority: 'low', date: '2026-09-27', startTime: '12:30' }),
  T({ id: 'high-late', title: 'High late', priority: 'high', date: '2026-09-27', startTime: '18:00' }),
  T({ id: 'high-untimed', title: 'High untimed', priority: 'high', date: '2026-09-27' }),
  T({ id: 'high-early', title: 'High early', priority: 'high', date: '2026-09-27', startTime: '13:00' }),
  T({ id: 'none', title: 'No priority', priority: 'none', date: '2026-09-27', startTime: '12:45' }),
  T({ id: 'overdue-low', title: 'Overdue low', priority: 'low', date: '2026-09-26' }),
  T({ id: 'pinned', title: 'Pinned', priority: 'none', pinned: true }),
  T({ id: 'done', title: 'Done', priority: 'high', date: '2026-09-27', status: 'done', completedAt: '2026-09-27T01:00:00.000Z' }),
];
const ids = (tasks) => tasks.map((t) => t.id);
check('smart: overdue, pinned, then High → Low → None, timed before untimed, done last',
  ids(sortTasks(list, 'smart', { now: noon })).join() === 'overdue-low,pinned,high-early,high-late,high-untimed,low-early,none,done',
  ids(sortTasks(list, 'smart', { now: noon })));
check('time: earliest first, then priority', ids(sortTasks(list, 'time', { now: noon })).slice(2, 6).join() === 'low-early,none,high-early,high-late',
  ids(sortTasks(list, 'time', { now: noon })));
check('manual: exactly your order', ids(sortTasks(list.map((t, i) => ({ ...t, manualOrder: -i })), 'manual', { now: noon })).slice(0, 3).join() === 'pinned,overdue-low,none');

/* ---------- Views ---------- */

const today = viewGroups('today', list, { now: noon }).groups[0].tasks;
check('Today: overdue + due today + pinned (done today kept)', ids(today).includes('overdue-low') && ids(today).includes('pinned') && ids(today).includes('done') && today.length === 8, ids(today));
check('Completed: hide leaves done tasks out and counts them', viewGroups('today', list, { now: noon, completed: 'hide' }).hidden === 1);
const moved = viewGroups('today', list, { now: noon, completed: 'move' }).groups;
check('Completed: move puts them in their own group', moved.at(-1).done && ids(moved.at(-1).tasks).join() === 'done', moved.map((g) => g.key));
const week = [T({ id: 'd1', date: '2026-09-28' }), T({ id: 'd7', date: '2026-10-04' }), T({ id: 'd8', date: '2026-10-05' }), T({ id: 'd0', date: '2026-09-27' })];
const upcoming = viewGroups('upcoming', week, { now: noon }).groups.filter((g) => g.tasks.length).map((g) => g.key);
check('Upcoming: the next 7 days, by day (not today, not day 8)', upcoming.join() === '2026-09-28,2026-10-04', upcoming);
check('counts for the view tabs', JSON.stringify(viewCounts(list, noon)) === JSON.stringify({ today: 7, upcoming: 0, overdue: 1, all: 7 }), viewCounts(list, noon));
const cats = new Map([['a', { id: 'a', name: 'Hospital', order: 1 }], ['b', { id: 'b', name: 'MBA', order: 0 }]]);
const byCat = viewGroups('category', [T({ id: 'x', categoryId: 'a' }), T({ id: 'y', categoryId: 'b' }), T({ id: 'z' })], { now: noon, categories: cats }).groups;
check('By category: in category order, "No category" last', byCat.map((g) => g.title).join() === 'MBA,Hospital,No category', byCat.map((g) => g.title));
const doneDays = viewGroups('completed', [
  T({ id: 'c1', status: 'done', completedAt: '2026-09-27T03:00:00.000Z' }), T({ id: 'c2', status: 'done', completedAt: '2026-09-26T03:00:00.000Z' }),
], { now: noon }).groups;
check('Completed view: grouped by the day they were done, newest first', doneDays.map((g) => g.title).join() === 'Today,Yesterday', doneDays.map((g) => g.title));

/* ---------- Words, search, tags, links ---------- */

check('time column: today with a range', timeCell(T({ date: '2026-09-27', startTime: '20:00', endTime: '21:00' }), '2026-09-27').main.replace(/\s/g, ' ').includes('8:00'));
check('time column: no time / no date', timeCell(T({ date: '2026-09-27' }), '2026-09-27').main === 'No time' && timeCell(T({}), '2026-09-27').main === 'No date');
const spoken = spokenRow(T({ title: 'Finish neurology report', priority: 'high', date: '2026-09-27', startTime: '20:00', endTime: '21:00' }), { category: { name: 'Hospital' }, now: noon });
check('VoiceOver reads the whole row', /^High priority\. Finish neurology report\. Today, 8:00\sPM to 9:00\sPM\. Hospital\. Not done\.$/.test(spoken), spoken);
const searchable = T({ title: 'Résumé for MBA', notes: 'send to the dean', tags: ['school'] });
check('search: accents and capitals don\'t matter', matchesTask(searchable, 'RESUME mba'));
check('search: notes, tags and category', matchesTask(searchable, 'dean') && matchesTask(searchable, '#school') && matchesTask(searchable, 'research', 'Research'));
check('search: every word must match', !matchesTask(searchable, 'resume hospital'));
check('tags: commas, # and duplicates', JSON.stringify(parseTags('school, #Paper, paper , ,MBA')) === JSON.stringify(['school', 'Paper', 'MBA']), parseTags('school, #Paper, paper , ,MBA'));
check('links: https is added', cleanUrl('drive.google.com/file/d/abc') === 'https://drive.google.com/file/d/abc');
check('links: only web addresses', cleanUrl('javascript:alert(1)') === null && cleanUrl('not a link') === null && cleanUrl('') === null);

/* ---------- Duplicates and CSV ---------- */

const first = T({ id: 'd-1', title: 'Call the lab', date: '2026-09-27', startTime: '10:00' });
const twin = { ...T({ id: 'd-2', title: 'call the LAB ', date: '2026-09-27', startTime: '10:00' }), createdAt: '2026-09-20T00:00:30.000Z' };
check('possible duplicate: same title, date and time within a minute', possibleDuplicate(twin, [first, twin])?.id === 'd-1');
check('…but not an hour apart', possibleDuplicate({ ...twin, createdAt: '2026-09-20T01:00:00.000Z' }, [first]) === null);
const csv = tasksToCsv([T({ title: 'Buy "good" coffee, beans', notes: '=SUM(A1)', tags: ['home'], date: '2026-09-27', startTime: '08:00' })]);
check('CSV starts with Excel\'s UTF-8 mark and a header', csv.startsWith('﻿Title,Status,Priority'));
check('CSV quotes commas and quotes', csv.includes('"Buy ""good"" coffee, beans"'), csv);
check('CSV never starts a cell with a formula', csv.includes("'=SUM(A1)") && !csv.includes(',=SUM'), csv);

/* ---------- Show the results ---------- */

const ol = document.getElementById('results');
results.forEach((r) => {
  const li = document.createElement('li');
  li.className = r.ok ? 'ok' : 'fail';
  li.textContent = `${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ` → ${r.detail}` : ''}`;
  ol.append(li);
});
const failed = results.filter((r) => !r.ok).length;
const summary = document.querySelector('[data-summary]');
summary.textContent = failed ? `${failed} of ${results.length} checks failed.` : `All ${results.length} checks passed.`;
summary.className = failed ? 'fail' : 'ok';
