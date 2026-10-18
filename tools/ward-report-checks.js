/* Checks for the ward report logic (pure functions only — nothing is saved).
   Every patient here is made up. Open tools/ward-report-checks.html through
   the preview server. */
import {
  DEFAULT_CLOSING, DEFAULT_OPENING, SEPARATOR, compareDay, datedLines, drasticChange, gcsOf, hospitalDay, lineChanges, lineDay, nameParts,
  patientReport, planChanges, referralText, reportDay, reportSetup, sameText, summaryBlock, summaryText, textOn,
} from '../js/modules/ward/report.js';

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: ok ? '' : JSON.stringify(detail) });
const TODAY = '2026-10-18';

/* ---------- The name box ---------- */

const n1 = nameParts('DELA CRUZ, JUAN 45/M DOA 10/12/26', TODAY);
check('name, age/sex and DOA on one line', n1.name === 'DELA CRUZ, JUAN' && n1.ageSex === '45/M' && n1.doa === '2026-10-12', n1);
const n2 = nameParts('Dela Cruz, Juan (45 y/o M) admitted Oct 12', TODAY);
check('“y/o”, brackets and “admitted Oct 12”', n2.name === 'Dela Cruz, Juan' && n2.ageSex === '45/M' && n2.doa === '2026-10-12', n2);
const n3 = nameParts('SANTOS, MARIA\n62/F\nDOA: 10/5', TODAY);
check('over several lines, a day without a year', n3.name === 'SANTOS, MARIA' && n3.ageSex === '62/F' && n3.doa === '2026-10-05', n3);
const n4 = nameParts('REYES, ANA 30F 2026-10-17', TODAY);
check('“30F” and a written-out day without “DOA”', n4.name === 'REYES, ANA' && n4.ageSex === '30/F' && n4.doa === '2026-10-17', n4);
const n5 = nameParts('LIM, PETER M/58 DOA 12/30', TODAY);
check('“M/58”; a day later in the year is last year', n5.name === 'LIM, PETER' && n5.ageSex === '58/M' && n5.doa === '2025-12-30', n5);
const n6 = nameParts('GARCIA, LUIS', TODAY);
check('only a name', n6.name === 'GARCIA, LUIS' && n6.ageSex === '' && n6.doa === null, n6);
const n7 = nameParts('MAY, JOSE 40 male DOA 5 Oct 2026 HD 14', TODAY);
check('a name that is a month, “40 male”, “5 Oct 2026”, HD dropped', n7.name === 'MAY, JOSE' && n7.ageSex === '40/M' && n7.doa === '2026-10-05', n7);
const n8 = nameParts('TAN, LEO / 71 / F / DOA 10-01-2026', TODAY);
check('slashes between the parts', n8.name === 'TAN, LEO' && n8.ageSex === '71/F' && n8.doa === '2026-10-01', n8);
const n9 = nameParts('UY, KIM 33/F DOA 10/25', TODAY);
check('a DOA after today counts as last year (never in the future)', n9.doa === '2025-10-25', n9);
check('hospital day: admission day is HD1', hospitalDay('2026-10-18', TODAY) === 1 && hospitalDay('2026-10-12', TODAY) === 7 && hospitalDay('2026-10-19', TODAY) === null);
check('days read as “Oct 5, 2026”', reportDay('2026-10-05') === 'Oct 5, 2026', reportDay('2026-10-05'));
check('days at the start of a line', lineDay('2026-10-16 Na 135', TODAY) === '2026-10-16' && lineDay('10/16 CT scan', TODAY) === '2026-10-16' && lineDay('CBC', TODAY) === null && lineDay('0.9 NaCl', TODAY) === null);

/* ---------- Comparing text ---------- */

check('same text ignores capitals, spaces and blank lines', sameText('Awake,  follows\n\nPupils 3mm', 'awake, follows\npupils 3mm') && !sameText('a', 'b'));
const lc = lineChanges('Aspirin 80mg OD\nAtorvastatin 40mg HS\nOmeprazole 40mg OD', 'Aspirin 80mg OD\nomeprazole 40mg od\nClopidogrel 75mg OD');
check('lines added and removed', lc.added.join('|') === 'Clopidogrel 75mg OD' && lc.removed.join('|') === 'Atorvastatin 40mg HS', lc);

/* ---------- A much worse exam ---------- */

check('paresis → plegia is drastic', drasticChange('Awake, MMT 4/5 right, right hemiparesis', 'Awake, right hemiplegia'));
check('decreased sensorium is drastic', drasticChange('Awake, conversant', 'Noted decreased sensorium, opens eyes to pain'));
check('no eye opening is drastic', drasticChange('Opens eyes to voice', 'No eye opening to pain, mumbles'));
check('“no plegia” / “not drowsy” are not', !drasticChange('Awake', 'Awake, not drowsy, no plegia'));
check('the same findings as before are not', !drasticChange('Drowsy, right hemiplegia', 'drowsy, right hemiplegia, pupils 3mm'));
check('a GCS 2 or more lower is drastic', drasticChange('GCS 14', 'GCS 10') && !drasticChange('GCS 14', 'GCS 13') && gcsOf('E2V3M5') === 10 && gcsOf('E1VTM4') === 6);
check('MMT 0/5 newly is drastic', drasticChange('MMT 3/5 on the left', 'MMT 0/5 on the left'));

/* ---------- Medications and plans ---------- */

const PLAN_BEFORE = `IVF: PNSS x 80cc/hr
Diet: NPO

Medication on Board
Paracetamol 1g IV Q6
Levetiracetam 500mg IV Q12
Dexamethasone 4mg IV Q8

Neuro Plans
> For repeat CT scan`;
const PLAN_AFTER = `IVF: PNSS x 60cc/hr
Diet: NPO

Medication on Board
Paracetamol 1g IV Q6
Levetiracetam 1g IV Q12
Mannitol 150cc IV Q6

Neuro Plans
> For repeat CT scan
> Will request EEG on Monday`;
const pc = planChanges(PLAN_BEFORE, PLAN_AFTER);
check('a new medication is started', pc.started.join('|') === 'Mannitol 150cc IV Q6', pc);
check('a medication that is gone is stopped', pc.stopped.join('|') === 'Dexamethasone 4mg IV Q8', pc);
check('a new dose is a change (also IVF)', pc.changed.map((x) => x.join(' → ')).sort().join('|') === 'IVF: PNSS x 80cc/hr → IVF: PNSS x 60cc/hr|Levetiracetam 500mg IV Q12 → Levetiracetam 1g IV Q12', pc.changed);
check('new plan lines come as written', pc.plans.join('|') === '> Will request EEG on Monday', pc.plans);
const nothing = planChanges(PLAN_AFTER, PLAN_AFTER);
check('nothing changed', !nothing.started.length && !nothing.stopped.length && !nothing.changed.length && !nothing.plans.length);

/* ---------- Labs with dates ---------- */

const LABS = `CBC
2026-10-18 Hgb 101 Plt 210 WBC 9.1
2026-10-16 Hgb 98 Plt 190 WBC 12.4H

Na
2026-10-17 Na 131L (9:00pm)
2026-10-14 Na 136

Culture
2026-10-12 Blood CS no growth`;
const dl = datedLines(LABS, TODAY, TODAY);
check('today’s results under their headings', dl.dated && dl.groups.length === 1 && dl.groups[0].heading === 'CBC' && dl.groups[0].lines.join('|') === '2026-10-18 Hgb 101 Plt 210 WBC 9.1' && dl.latest === '2026-10-18', dl);
const dl2 = datedLines(LABS, '2026-10-17', TODAY);
check('today and yesterday', dl2.groups.map((g) => `${g.heading}:${g.lines.length}`).join('|') === 'CBC:1|Na:1', dl2.groups);
const dl3 = datedLines('CBC\n2026-10-16 Hgb 98\nNa\n2026-10-18 Na 131', TODAY, TODAY);
check('headings without blank lines between groups', dl3.groups.length === 1 && dl3.groups[0].heading === 'Na', dl3.groups);
check('no dated lines', !datedLines('Hgb 98, Na 131', TODAY, TODAY).dated);

/* ---------- What a box said before ---------- */

const seen = {
  '2026-10-16': { cols: ['D', 'J', 'L', 'N'], rows: { H1: { L: 'Awake, MMT 4/5 right', N: PLAN_BEFORE } } },
  '2026-10-17': { cols: ['D', 'J', 'K', 'L', 'M', 'N'], rows: { H1: { L: 'Awake, MMT 4/5 right', K: 'IM - for co-management', M: '10/12 CT: left MCA infarct', N: PLAN_BEFORE } } },
};
check('the day to compare with is yesterday', compareDay(seen, TODAY) === '2026-10-17');
check('…or the last day the list was opened before', compareDay({ '2026-10-15': {} }, TODAY) === '2026-10-15' && compareDay({}, TODAY) === '2026-10-17');
const pt = { id: 'H1', key: 'H1', name: 'DELA CRUZ, JUAN 45/M DOA 10/12/26', location: 'Ward 3 Bed 4', cells: {}, edited: {} };
check('what a box said at the end of a day', textOn(pt, 'L', '2026-10-17', seen) === 'Awake, MMT 4/5 right');
check('a patient not on the list that day had nothing', textOn({ ...pt, key: 'NEW' }, 'L', '2026-10-17', seen) === '');
check('unknown without a look or an edit', textOn(pt, 'L', '2026-10-15', seen) === undefined);
check('from your edits when this device didn’t look that day', textOn({ ...pt, edited: { L: { '2026-10-15': { before: 'a', after: 'b' } } } }, 'L', '2026-10-14', {}) === 'a');

/* ---------- The setup ---------- */

const columns = [
  { col: 'D', label: 'Labs' }, { col: 'E', label: 'Location', location: true }, { col: 'J', label: 'Diagnosis' }, { col: 'K', label: 'Services' },
  { col: 'L', label: 'Events' }, { col: 'M', label: 'Imaging' }, { col: 'N', label: 'Meds / Plans' },
];
const guess = reportSetup(null, columns);
check('the setup is guessed from the headings', JSON.stringify(guess.cols) === JSON.stringify({ dx: 'J', events: 'L', services: 'K', labs: 'D', imaging: 'M', plans: 'N' }) && !guess.saved, guess.cols);
const saved = reportSetup({ cols: { dx: 'J', events: 'L', services: 'K', labs: 'D', imaging: 'Z', plans: 'N' }, open: 'Good morning', close: '' }, columns);
check('a saved setup wins; a column the list lost is left out', saved.saved && saved.cols.imaging === '' && saved.open === 'Good morning' && saved.close === '', saved);
check('the referral’s lines start as yours', guess.open === DEFAULT_OPENING && guess.close === DEFAULT_CLOSING);

/* ---------- One patient's report ---------- */

const setup = { cols: { dx: 'J', events: 'L', services: 'K', labs: 'D', imaging: 'M', plans: 'N' }, open: DEFAULT_OPENING, close: DEFAULT_CLOSING, saved: true };
const patient = {
  ...pt,
  cells: {
    D: LABS,
    J: 'Acute ischemic stroke, left MCA\nHypertension',
    K: 'IM - for co-management\nRehab - for PT',
    L: 'Drowsy, right hemiplegia, MMT 0/5 right',
    M: '10/12 CT: left MCA infarct\n10/18 CT: hemorrhagic conversion',
    N: PLAN_AFTER,
  },
};
const r = patientReport(patient, setup, { seen, today: TODAY, days: 1 });
check('the parts of the name box', r.name === 'DELA CRUZ, JUAN' && r.ageSex === '45/M' && r.doa === '2026-10-12' && r.hd === 7, r);
check('events changed, and much worse', r.events.status === 'changed' && r.events.drastic, r.events);
check('new services and imaging only', r.services.lines.join('|') === 'Rehab - for PT' && r.imaging.lines.join('|') === '10/18 CT: hemorrhagic conversion', [r.services, r.imaging]);
check('plans changed', r.plans.status === 'changed' && r.plans.started.length === 1);

const block = summaryBlock(r, { days: 1 });
const expected = `Name: DELA CRUZ, JUAN
Age/Gender: 45/M
DOA: Oct 12, 2026 · HD 7

Diagnosis:
Acute ischemic stroke, left MCA
Hypertension

Events:
Awake, MMT 4/5 right

to now

Drowsy, right hemiplegia, MMT 0/5 right
Services ordered:
Rehab - for PT

Labs:
CBC
2026-10-18 Hgb 101 Plt 210 WBC 9.1
Imaging:
10/18 CT: hemorrhagic conversion

Plans:
Started: Mannitol 150cc IV Q6
Stopped: Dexamethasone 4mg IV Q8
Changed: IVF: PNSS x 80cc/hr → IVF: PNSS x 60cc/hr
Changed: Levetiracetam 500mg IV Q12 → Levetiracetam 1g IV Q12
> Will request EEG on Monday`;
check('the summary, in your format', block === expected, block);
check('the earlier exam can be turned off', summaryBlock(r, { earlier: false }).includes('Events:\nDrowsy, right hemiplegia, MMT 0/5 right\nServices'));

const quiet = patientReport({ ...patient, cells: { ...patient.cells, L: 'Awake, MMT 4/5 right', K: 'IM - for co-management', M: '10/12 CT: left MCA infarct', N: PLAN_BEFORE, D: 'CBC\n2026-10-16 Hgb 98' } }, setup, { seen, today: TODAY, days: 1 });
const quietText = summaryBlock(quiet, { days: 1 });
check('nothing new today', quietText.includes('Events:\nNo new events today.') && quietText.includes('Labs:\nNo new results today (last: Oct 16, 2026).') && quietText.includes('Plans:\nNo changes today.') && !quietText.includes('Services ordered') && !quietText.includes('Imaging'), quietText);

const both = patientReport(patient, setup, { seen: { ...seen, '2026-10-16': { cols: ['L'], rows: { H1: { L: 'Awake, conversant' } } } }, today: TODAY, days: 2 });
check('today + yesterday: yesterday’s events, then today’s', both.events.mid === 'Awake, MMT 4/5 right' && summaryBlock(both, { days: 2 }).includes('Events:\nYesterday:\nAwake, MMT 4/5 right\n\nToday:\nDrowsy'), both.events);
check('today + yesterday: labs from both days', summaryBlock(both, { days: 2 }).includes('2026-10-17 Na 131L'));

const fresh = patientReport({ ...patient, key: 'NEW', id: 'NEW' }, setup, { seen, today: TODAY, days: 1 });
check('a new patient: everything is new', fresh.events.status === 'changed' && fresh.services.lines.length === 2 && fresh.plans.status === 'changed');
const unknown = patientReport(patient, setup, { seen: {}, today: TODAY, days: 1 });
check('nothing to compare with: boxes in full', unknown.events.status === 'unknown' && summaryBlock(unknown).includes('Plans:\nIVF: PNSS x 60cc/hr'), unknown.events);

const two = summaryText([r, quiet], { days: 1, earlier: new Map([[r.id, false]]) });
check('patients separated by a dashed line, one after the last', two.split(SEPARATOR).length === 3 && two.endsWith(`\n\n${SEPARATOR}`) && !two.includes('to now'), two);

const ref = referralText({ ...r, location: 'Ward 3 Bed 4' }, setup, { days: 1 });
check('the referral starts with your first line and the patient', ref.startsWith(`${DEFAULT_OPENING}\nDELA CRUZ, JUAN\n45/M\nDOA Oct 12, 2026 · HD 7\nCurrently at Ward 3 Bed 4\n\nCase of\nAcute ischemic stroke`), ref);
check('the referral: CC with the earlier exam “to now”, then services', ref.includes('CC:\nAwake, MMT 4/5 right\n\nto now\n\nDrowsy, right hemiplegia, MMT 0/5 right\n\nIM - for co-management\nRehab - for PT'), ref);
check('the referral: all labs, imaging, P> and your last line', ref.includes('\n\nCBC\n2026-10-18 Hgb 101') && ref.includes('2026-10-12 Blood CS no growth\n\n10/12 CT') && ref.includes('\n\nP>\nIVF: PNSS x 60cc/hr') && ref.endsWith(`\n\n${DEFAULT_CLOSING}`), ref);
const plain = referralText(quiet, { ...setup, close: '' }, { days: 1 });
check('the referral without changes shows today’s exam; no last line when it’s empty', plain.includes('CC:\nAwake, MMT 4/5 right\n\nIM - for co-management') && !plain.includes('to now') && !plain.includes(DEFAULT_CLOSING), plain);

/* ---------- Show the results ---------- */

const ol = document.getElementById('results');
results.forEach((x) => {
  const li = document.createElement('li');
  li.className = x.ok ? 'ok' : 'fail';
  li.textContent = `${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? ` → ${x.detail}` : ''}`;
  ol.append(li);
});
const failed = results.filter((x) => !x.ok).length;
const summary = document.querySelector('[data-summary]');
summary.textContent = failed ? `${failed} of ${results.length} checks failed.` : `All ${results.length} checks passed.`;
summary.className = failed ? 'fail' : 'ok';
