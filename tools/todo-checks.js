/* Checks for the to-do logic (pure functions only — nothing is saved). Open
   tools/todo-checks.html through the preview server. Times are fixed moments,
   so the results don't depend on when or where the checks run. */
import { addDays, at, daysFrom, msUntilMidnight, todayKey, weekdayOf } from '../js/core/manila.js';
import {
  cleanUrl, dueAt, isOverdue, matchesTask, newTask, normalizeTask, overdueText, parseTags, possibleDuplicate, scheduledSubtasks,
  sortTasks, spokenRow, subtaskArms, tasksToCsv, timeCell, viewCounts, viewGroups,
} from '../js/modules/todo/model.js';
import { parseTask } from '../js/modules/todo/parse.js';
import {
  afterSnooze, afterStop, afterStopFollowUps, dueAlerts, followRules, markRung, nextAlertAt, outOfQuiet, reminderDue, reminderLabel,
  reminderSettings, settleAlerts,
} from '../js/modules/todo/alerts.js';

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

/* ---------- Plain words (parse.js) ---------- */

// Sunday 27 September 2026, 10:00 AM in Manila; weeks start on Sunday; "3/10" is month/day
const P_NOW = Date.parse('2026-09-27T02:00:00Z');
const P_CATS = [
  { id: 'cat-mba', name: 'MBA' }, { id: 'cat-business', name: 'Business' }, { id: 'cat-board', name: 'Board exam' },
  { id: 'cat-research', name: 'Research' }, { id: 'cat-residency', name: 'Residency' },
];
const read = (text, opts = {}) => parseTask(text, { now: P_NOW, categories: P_CATS, dateOrder: 'md', weekStart: 0, ...opts });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function phrase(text, expect, opts = {}) {
  const r = read(text, opts);
  const got = { title: r.title, ...r.fields };
  if (got.endTime == null) delete got.endTime;
  const keys = new Set([...Object.keys(expect), ...Object.keys(got)]);
  check(`words: “${text}”${opts.note ? ` (${opts.note})` : ''}`, [...keys].every((k) => same(got[k], expect[k])), got);
}

phrase('Finish STRAMA paper tomorrow 8pm #MBA !!!', { title: 'Finish STRAMA paper', date: '2026-09-28', startTime: '20:00', priority: 'high', categoryId: 'cat-mba' });
phrase('Call the lab', { title: 'Call the lab' });
phrase('Submit report today', { title: 'Submit report', date: '2026-09-27' });
phrase('Pay rent tmrw', { title: 'Pay rent', date: '2026-09-28' });
phrase('Dinner with family tonight 7pm', { title: 'Dinner with family', date: '2026-09-27', startTime: '19:00' });
phrase('Journal club on Friday', { title: 'Journal club', date: '2026-10-02' });
phrase('Grand rounds monday 7:30am', { title: 'Grand rounds', date: '2026-09-28', startTime: '07:30' });
phrase('Team meeting next Monday', { title: 'Team meeting', date: '2026-10-05' }, { note: 'weeks start Sunday' });
phrase('Team meeting next Monday', { title: 'Team meeting', date: '2026-09-28' }, { weekStart: 1, note: 'weeks start Monday' });
phrase('Buy gift for Sunday', { title: 'Buy gift', date: '2026-09-27' });
phrase('Renew license in 3 days', { title: 'Renew license', date: '2026-09-30' });
phrase('Review papers in 2 weeks', { title: 'Review papers', date: '2026-10-11' });
phrase('Conference Oct 3', { title: 'Conference', date: '2026-10-03' });
phrase('Deadline 3 October', { title: 'Deadline', date: '2026-10-03' });
phrase('Birthday on Sept 5', { title: 'Birthday', date: '2027-09-05' }, { note: 'already past: next year' });
phrase('Cake on Feb 29', { title: 'Cake', date: '2028-02-29' });
phrase('Pay bill 10/15', { title: 'Pay bill', date: '2026-10-15' });
phrase('Pay bill 10/15/2026', { title: 'Pay bill', date: '2026-10-15' });
phrase('Pay bill 2/30', { title: 'Pay bill 2/30' }, { note: 'not a real date' });
phrase('Meet 3/10', { title: 'Meet', date: '2026-10-03' }, { choices: { 'date:3/10': '2026-10-03' }, note: 'after choosing Oct 3' });
phrase('Rounds 8-9 PM', { title: 'Rounds', date: '2026-09-27', startTime: '20:00', endTime: '21:00' });
phrase('Meeting 3-4pm tomorrow', { title: 'Meeting', date: '2026-09-28', startTime: '15:00', endTime: '16:00' });
phrase('Rounds 11-1pm', { title: 'Rounds', date: '2026-09-27', startTime: '11:00', endTime: '13:00' });
phrase('Night shift 11pm-7am tomorrow', { title: 'Night shift', date: '2026-09-28', startTime: '23:00', endTime: '07:00' });
phrase('Clinic 8:30 PM', { title: 'Clinic', date: '2026-09-27', startTime: '20:30' });
phrase('Surgery 20:00', { title: 'Surgery', date: '2026-09-27', startTime: '20:00' });
phrase('Lunch at noon', { title: 'Lunch', date: '2026-09-27', startTime: '12:00' });
phrase('Standup 9am', { title: 'Standup', date: '2026-09-28', startTime: '09:00' }, { note: 'already past today: tomorrow' });
phrase('Ward 5A rounds 7am', { title: 'Ward 5A rounds', date: '2026-09-28', startTime: '07:00' }, { note: '"5A" stays words' });
phrase('Call mom at 8', { title: 'Call mom', date: '2026-09-27', startTime: '20:00' }, { choices: { 'time:at 8': { start: '20:00', end: null } }, note: 'after choosing PM' });
phrase('Call mom tonight at 8', { title: 'Call mom', date: '2026-09-27', startTime: '20:00' }, { note: 'tonight means PM' });
phrase('Read chapter !', { title: 'Read chapter', priority: 'low' });
phrase('Read chapter !!', { title: 'Read chapter', priority: 'medium' });
phrase('Fix bug high priority', { title: 'Fix bug', priority: 'high' });
phrase('Buy groceries @home @errands', { title: 'Buy groceries', tags: ['home', 'errands'] });
phrase('Email john@example.com', { title: 'Email john@example.com' });
phrase('Draft proposal #business', { title: 'Draft proposal', categoryId: 'cat-business' });
phrase('Prep #boardexam', { title: 'Prep', categoryId: 'cat-board' }, { note: 'spaces don’t matter' });
phrase('Study #bo', { title: 'Study', categoryId: 'cat-board' }, { note: 'the start of a name' });
phrase('Study #b', { title: 'Study #b' }, { note: 'too short to choose' });
phrase('Unknown #nothing', { title: 'Unknown #nothing' });
phrase('Sat for exam', { title: 'Sat for exam' }, { note: 'short day names need "on"' });
phrase('Buy sun cream', { title: 'Buy sun cream' });
phrase('Workout on mon', { title: 'Workout', date: '2026-09-28' });
phrase('Pay 3.10 dollars', { title: 'Pay 3.10 dollars' });
phrase('Take 8 a day', { title: 'Take 8 a day' });
phrase('Grant report due friday 5pm !!! #research @grant', { title: 'Grant report', date: '2026-10-02', startTime: '17:00', priority: 'high', categoryId: 'cat-research', tags: ['grant'] });
phrase('Send report tomorrow', { title: 'Send report tomorrow' }, { ignore: ['date:tomorrow'], note: 'chip removed' });
phrase('Rounds 8-9 PM', { title: 'Rounds 8-9 PM' }, { ignore: ['time:8-9 pm'], note: 'chip removed: no leftover "9 PM"' });

const ask = read('Meet 3/10');
check('asks: “3/10” could be Mar 10 or Oct 3 (month first here)', ask.unanswered.length === 1 && same(ask.unanswered[0].options.map((o) => o.value), ['2027-03-10', '2026-10-03']) && !ask.fields.date, ask);
check('asks: both readings name the month (“Oct 3”, not “Saturday”)', same(ask.unanswered[0]?.options.map((o) => o.label), ['Mar 10, 2027', 'Oct 3']), ask.unanswered[0]?.options);
const askDm = read('Meet 3/10', { dateOrder: 'dm' });
check('asks: day first where that is usual', same(askDm.unanswered[0]?.options.map((o) => o.value), ['2026-10-03', '2027-03-10']), askDm.unanswered);
const askTime = read('Call mom at 8');
check('asks: “at 8” — 8 AM or 8 PM (morning first for 7–11)', askTime.unanswered.length === 1 && same(askTime.unanswered[0].options.map((o) => o.value.start), ['08:00', '20:00']) && !askTime.fields.startTime, askTime.unanswered);
const askCat = read('Paper #re');
check('asks: “#re” fits two categories', askCat.unanswered.length === 1 && same(askCat.unanswered[0].options.map((o) => o.label), ['Research', 'Residency']), askCat.unanswered);
const chips = read('Finish STRAMA paper tomorrow 8pm #MBA !!!').parts.map((p) => p.label);
check('chips: Tomorrow · 8:00 PM · MBA · High', chips[0] === 'Tomorrow' && /8:00/.test(chips[1]) && chips[2] === 'MBA' && chips[3] === 'High', chips);
const fridayChip = read('Journal club on Friday').parts[0]?.label;
check('chips: a weekday shows its date (“Fri, Oct 2”)', /Fri/.test(fridayChip) && /Oct/.test(fridayChip) && /2/.test(fridayChip), fridayChip);
check('empty text reads as nothing', same(read('').fields, {}) && read('').title === '');
phrase('Call the lab tomorrow 8am remind me 30 min before', { title: 'Call the lab', date: '2026-09-28', startTime: '08:00', reminders: [{ kind: 'before', minutes: 30 }] });
phrase('Remind me to call mom tonight 7pm', { title: 'Call mom', date: '2026-09-27', startTime: '19:00', reminders: [{ kind: 'before', minutes: 0 }] });
phrase('Pay rent Oct 1 remind me 1 day before', { title: 'Pay rent', date: '2026-10-01', reminders: [{ kind: 'before', minutes: 1440 }] });
phrase('Submit form 5pm remind me an hour before remind me 10 min before', { title: 'Submit form', date: '2026-09-27', startTime: '17:00',
  reminders: [{ kind: 'before', minutes: 60 }, { kind: 'before', minutes: 10 }] });
phrase('Journal club 3pm remind me half an hour before', { title: 'Journal club', date: '2026-09-27', startTime: '15:00', reminders: [{ kind: 'before', minutes: 30 }] });
phrase('Remind the team about rounds', { title: 'Remind the team about rounds' }, { note: '"me" is needed' });
phrase('Reminders app review', { title: 'Reminders app review' });
const remChip = read('Call the lab 8am remind me 30 min before').parts.find((p) => p.kind === 'reminder')?.label;
check('chips: a reminder shows as "30 min before"', remChip === '30 min before', remChip);

/* ---------- Subtasks with their own date ---------- */

const paper = T({ id: 'p1', title: 'Paper', date: '2026-09-30', priority: 'high' });
const subList = [
  { id: 's1', taskId: 'p1', title: 'Outline', done: false, order: 0, date: '2026-09-27', startTime: '15:00' },
  { id: 's2', taskId: 'p1', title: 'Draft', done: false, order: 1, date: null },
  { id: 's3', taskId: 'gone', title: 'Orphan', done: false, order: 0, date: '2026-09-27' },
];
const subRows = scheduledSubtasks(subList, [paper]);
check('subtasks with a date become rows (not undated or orphaned ones)', subRows.length === 1 && subRows[0].kind === 'subtask'
  && subRows[0].parentTitle === 'Paper' && subRows[0].priority === 'high', subRows);
const todayIds = viewGroups('today', [paper], { now: noon, subtasks: subRows }).groups[0].tasks.map((t) => t.id);
check('a subtask due today shows in Today, even when its task is due later', todayIds.includes('s1') && !todayIds.includes('p1'), todayIds);
check('…and counts in Today', viewCounts([paper], noon, subRows).today === 1);
check('…but stays inside its task in All and By category', !viewGroups('all', [paper], { now: noon, subtasks: subRows }).groups[0].tasks.some((t) => t.kind === 'subtask'));
check('a done task\'s subtasks leave the lists', scheduledSubtasks(subList, [{ ...paper, status: 'done' }]).length === 0);
check('a subtask row reads "Subtask of …"', spokenRow(subRows[0], { now: noon }).startsWith('Subtask of Paper. Outline. Today, 3:00 PM'), spokenRow(subRows[0], { now: noon }));
check('a subtask\'s menu swaps task-only actions for others', JSON.stringify(subtaskArms({ up: 'reminder', right: 'priority', down: 'delete', left: 'pin' }))
  === JSON.stringify({ up: 'reminder', right: 'task', down: 'delete', left: 'details' }), subtaskArms({ up: 'reminder', right: 'priority', down: 'delete', left: 'pin' }));

/* ---------- Reminders (alerts.js) ---------- */

// Monday 28 September 2026, 09:00 in Manila (01:00 UTC); default settings: 8:00 AM, follow-ups every 2 hours, up to 2, quiet 10 PM – 8 AM
const R_NOW = Date.parse('2026-09-28T01:00:00Z');
const M = (hhmm, day = '2026-09-28') => at(day, hhmm).getTime(); // a Manila time as ms
const RS = reminderSettings({});
const rem = (id, fields) => ({ id, kind: 'before', createdAt: '2026-09-27T00:00:00.000Z', ...fields });
const task = (fields) => ({ id: 'rt', status: 'open', priority: 'medium', reminders: [], alerts: {}, ...fields });
const timed = task({ date: '2026-09-28', startTime: '14:00', reminders: [rem('a', { minutes: 30 })] });
check('reminders: 30 min before a 2:00 PM task rings at 1:30 PM', reminderDue(timed, timed.reminders[0]) === M('13:30'), new Date(reminderDue(timed, timed.reminders[0])));
const untimed = task({ date: '2026-09-29', reminders: [rem('b', { minutes: 60 })] });
check('reminders: a task with no time counts from 8:00 AM', reminderDue(untimed, untimed.reminders[0], RS.defaultTime) === M('07:00', '2026-09-29'));
check('reminders: "before" needs a date; an exact time doesn\'t', reminderDue(task({ date: null }), rem('c', { minutes: 10 })) === null
  && reminderDue(task({ date: null }), { id: 'd', kind: 'at', at: '2026-09-28T05:00:00.000Z' }) === Date.parse('2026-09-28T05:00:00.000Z'));
check('reminders: nothing rings before its time', dueAlerts(timed, RS, M('13:29')).length === 0);
const ring1 = dueAlerts(timed, RS, M('13:31'));
check('reminders: it rings at its time', ring1.length === 1 && ring1[0].type === 'reminder' && ring1[0].due === M('13:30'), ring1);
let t1 = { ...timed, alerts: markRung(timed, ring1, RS, M('13:31')) };
check('reminders: …once only', dueAlerts(t1, RS, M('13:45')).length === 0, t1.alerts);
check('follow-ups: lined up for when the banner would time out (+5 min) + 2 hours', t1.alerts.follow?.next === new Date(M('15:36')).toISOString(), t1.alerts);
t1 = { ...t1, alerts: afterStop(t1, RS, M('13:40')) };
check('follow-ups: Stop → 2 hours after you stopped it', t1.alerts.follow.next === new Date(M('15:40')).toISOString(), t1.alerts);
const f1 = dueAlerts(t1, RS, M('15:41'));
check('follow-ups: "Still not done" rings then', f1.length === 1 && f1[0].type === 'follow', f1);
t1 = { ...t1, alerts: markRung(t1, f1, RS, M('15:41')) };
t1 = { ...t1, alerts: afterStop(t1, RS, M('15:42')) };
check('follow-ups: the next one 2 hours later', t1.alerts.follow.count === 1 && t1.alerts.follow.next === new Date(M('17:42')).toISOString(), t1.alerts);
t1 = { ...t1, alerts: markRung(t1, dueAlerts(t1, RS, M('17:43')), RS, M('17:43')) };
check('follow-ups: stop at the limit (2)', t1.alerts.follow.count === 2 && t1.alerts.follow.next === null && nextAlertAt(t1, RS, M('17:44')) === null, t1.alerts);
check('quiet hours: 11:00 PM moves to 8:00 AM the next morning', outOfQuiet(M('23:00'), RS.followUps) === M('08:00', '2026-09-29')
  && outOfQuiet(M('21:00'), RS.followUps) === M('21:00'));
const late = task({ date: '2026-09-28', startTime: '21:00', reminders: [rem('e', { minutes: 30 })] });
const lateRung = { ...late, alerts: afterStop({ ...late, alerts: markRung(late, dueAlerts(late, RS, M('20:31')), RS, M('20:31')) }, RS, M('20:32')) };
check('quiet hours: a follow-up due at 10:32 PM waits until 8:00 AM', lateRung.alerts.follow.next === new Date(M('08:00', '2026-09-29')).toISOString(), lateRung.alerts);
let t2 = { ...timed, alerts: afterSnooze({ ...timed, alerts: markRung(timed, ring1, RS, M('13:31')) }, 10, M('13:32')) };
check('snooze: rings again in 10 minutes, follow-ups wait', t2.alerts.snooze.at === new Date(M('13:42')).toISOString() && t2.alerts.follow.next === null
  && dueAlerts(t2, RS, M('13:41')).length === 0 && dueAlerts(t2, RS, M('13:42'))[0]?.type === 'snooze', t2.alerts);
t2 = { ...t2, alerts: markRung(t2, dueAlerts(t2, RS, M('13:42')), RS, M('13:42')) };
check('snooze: once it rings, follow-ups start again', !t2.alerts.snooze && t2.alerts.follow.count === 0 && Boolean(t2.alerts.follow.next), t2.alerts);
const t3 = { ...t1, alerts: afterStopFollowUps({ ...timed, alerts: markRung(timed, ring1, RS, M('13:31')) }) };
check('Stop follow-ups: nothing more rings', t3.alerts.follow.off && nextAlertAt(t3, RS, M('13:32')) === null && dueAlerts(t3, RS, M('20:00')).length === 0, t3.alerts);
check('done, deleted and sample tasks never ring', dueAlerts({ ...timed, status: 'done' }, RS, M('13:31')).length === 0
  && dueAlerts({ ...timed, deletedAt: '2026-09-28T00:00:00Z' }, RS, M('13:31')).length === 0 && dueAlerts({ ...timed, sample: true }, RS, M('13:31')).length === 0);
const setLate = task({ date: '2026-09-28', startTime: '09:05', reminders: [rem('f', { minutes: 30, createdAt: '2026-09-28T01:00:00.000Z' })] });
check('a reminder set after its time never rings late', dueAlerts(setLate, RS, M('09:10')).length === 0);
check('reminders missed by more than a week are skipped', dueAlerts(task({ date: '2026-09-18', startTime: '10:00', reminders: [rem('g', { minutes: 10 })] }), RS, M('10:00')).length === 0);
const withFollow = { ...timed, alerts: afterStop({ ...timed, alerts: markRung(timed, ring1, RS, M('13:31')) }, RS, M('13:40')) };
const settledDone = settleAlerts(withFollow, { ...withFollow, status: 'done' }, RS, M('13:50'));
check('completing a task ends its follow-ups', !settledDone.follow && !settledDone.snooze && Object.keys(settledDone.seen).length === 1, settledDone);
const movedDay = { ...withFollow, date: '2026-09-29' };
const settledMoved = settleAlerts(withFollow, movedDay, RS, M('13:50'));
check('moving it to another day ends the old follow-ups; its reminder rings again then', !settledMoved.follow
  && dueAlerts({ ...movedDay, alerts: settledMoved }, RS, M('13:31', '2026-09-29')).length === 1, settledMoved);
const earlier = { ...timed, startTime: '09:20' };
const settledEarlier = settleAlerts(timed, earlier, RS, R_NOW);
check('a new time already passed counts as rung (never rung late)', dueAlerts({ ...earlier, alerts: settledEarlier }, RS, R_NOW + 60e3).length === 0, settledEarlier);
check('follow-ups: sooner for High priority when set', followRules({ priority: 'high' }, reminderSettings({ followUps: { highMinutes: 60 } })).minutes === 60
  && followRules({ priority: 'low' }, reminderSettings({ followUps: { highMinutes: 60 } })).minutes === 120);
const own = { ...timed, followUp: { enabled: false } };
check('follow-ups: a task can turn them off', markRung(own, ring1, RS, M('13:31')).follow?.next == null);
check('next alert: the earliest still to come', nextAlertAt({ ...timed, reminders: [rem('h', { minutes: 60 }), rem('i', { minutes: 10 })] }, RS, M('13:10')) === M('13:50'));
check('reminder words', reminderLabel(rem('j', { minutes: 30 })) === '30 min before' && reminderLabel(rem('k', { minutes: 60 })) === '1 hour before'
  && reminderLabel(rem('l', { minutes: 2880 })) === '2 days before' && reminderLabel(rem('m', { minutes: 0 })) === 'At the time'
  && /Tomorrow, 7:00/.test(reminderLabel({ kind: 'at', at: new Date(M('07:00', '2026-09-29')).toISOString() }, R_NOW)),
  [reminderLabel(rem('j', { minutes: 30 })), reminderLabel({ kind: 'at', at: new Date(M('07:00', '2026-09-29')).toISOString() }, R_NOW)]);
const oldSeen = settleAlerts({ ...timed, alerts: { seen: { 'z@2026-08-01T00:00:00.000Z': '2026-08-01T00:00:00.000Z' } } }, timed, RS, R_NOW);
check('rung reminders are forgotten after a month', !oldSeen.seen?.['z@2026-08-01T00:00:00.000Z'], oldSeen);

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
