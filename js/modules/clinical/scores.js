/* Bedside score calculators (0.11.0) — the scales themselves, as data.

   Each calculator:
     { id, name, full, group, source, note?, items, result(values) }
   items: [{ id, label, short?, hint?, kind: 'choice' (default) | 'check' | 'number', options, optional?(values),
             unit?, min?, max?, step? }]
     choice options: [{ v: points, label, un? (not testable: counts 0, shown as UN / NT / T) }]
     check: ticked = points (ASPECTS counts down, so its points are -1)
   result(values) → { big, unit?, meaning, tone ('good' | 'mid' | 'bad' | null), lines?: [text] }
     values: { itemId: index of the chosen option | true/false (check) | number }

   A quick aid only: every scale says where it comes from, and the page reminds
   you to check against the original and your hospital's protocol. */

const pick = (item, values) => (values[item.id] == null ? null : item.options?.[values[item.id]] ?? null);
const answered = (calc, values) => calc.items.every((it) => it.kind === 'check' || it.optional?.(values) || values[it.id] != null && values[it.id] !== '');
/** Total of the chosen options' points (and ticked boxes). */
const total = (calc, values) => calc.items.reduce((n, it) => {
  if (it.kind === 'check') return n + (values[it.id] ? it.points : 0);
  return n + (pick(it, values)?.v ?? 0);
}, 0);
const yesNo = (yes = 1) => [{ v: 0, label: 'No' }, { v: yes, label: 'Yes' }];
const band = (n, bands) => bands.find(([max]) => n <= max) ?? bands[bands.length - 1];
const round1 = (n) => Math.round(n * 10) / 10;

/* ---------- Stroke ---------- */

const NIHSS_ITEMS = [
  { id: '1a', label: '1a. Level of consciousness', options: [
    { v: 0, label: 'Alert, keenly responsive' },
    { v: 1, label: 'Not alert, but arousable by minor stimulation' },
    { v: 2, label: 'Not alert, needs repeated or painful stimulation' },
    { v: 3, label: 'Unresponsive, or reflex responses only' }] },
  { id: '1b', label: '1b. LOC questions (month, age)', options: [
    { v: 0, label: 'Answers both correctly' }, { v: 1, label: 'Answers one correctly' }, { v: 2, label: 'Answers neither correctly' }] },
  { id: '1c', label: '1c. LOC commands (open/close eyes, grip/release)', options: [
    { v: 0, label: 'Performs both correctly' }, { v: 1, label: 'Performs one correctly' }, { v: 2, label: 'Performs neither correctly' }] },
  { id: '2', label: '2. Best gaze', options: [
    { v: 0, label: 'Normal' }, { v: 1, label: 'Partial gaze palsy' }, { v: 2, label: 'Forced deviation, or total gaze paresis' }] },
  { id: '3', label: '3. Visual fields', options: [
    { v: 0, label: 'No visual loss' }, { v: 1, label: 'Partial hemianopia' }, { v: 2, label: 'Complete hemianopia' },
    { v: 3, label: 'Bilateral hemianopia (blind, including cortical blindness)' }] },
  { id: '4', label: '4. Facial palsy', options: [
    { v: 0, label: 'Normal symmetrical movement' }, { v: 1, label: 'Minor paralysis (flattened nasolabial fold, asymmetric smile)' },
    { v: 2, label: 'Partial paralysis (total or near-total lower face)' }, { v: 3, label: 'Complete paralysis of one or both sides' }] },
  ...['5a. Motor arm — left', '5b. Motor arm — right'].map((label, i) => ({ id: i ? '5b' : '5a', label, hint: 'Arm held at 90° (sitting) or 45° (lying) for 10 seconds', options: [
    { v: 0, label: 'No drift for 10 seconds' }, { v: 1, label: 'Drift, but doesn’t hit the bed' },
    { v: 2, label: 'Some effort against gravity' }, { v: 3, label: 'No effort against gravity; limb falls' },
    { v: 4, label: 'No movement' }, { v: 0, label: 'UN — amputation or joint fusion', un: true }] })),
  ...['6a. Motor leg — left', '6b. Motor leg — right'].map((label, i) => ({ id: i ? '6b' : '6a', label, hint: 'Leg held at 30° (lying) for 5 seconds', options: [
    { v: 0, label: 'No drift for 5 seconds' }, { v: 1, label: 'Drift, but doesn’t hit the bed' },
    { v: 2, label: 'Some effort against gravity' }, { v: 3, label: 'No effort against gravity; falls to the bed at once' },
    { v: 4, label: 'No movement' }, { v: 0, label: 'UN — amputation or joint fusion', un: true }] })),
  { id: '7', label: '7. Limb ataxia', hint: 'Only if out of proportion to weakness', options: [
    { v: 0, label: 'Absent' }, { v: 1, label: 'Present in one limb' }, { v: 2, label: 'Present in two limbs' },
    { v: 0, label: 'UN — amputation or joint fusion', un: true }] },
  { id: '8', label: '8. Sensory', options: [
    { v: 0, label: 'Normal, no sensory loss' }, { v: 1, label: 'Mild to moderate loss' }, { v: 2, label: 'Severe to total loss' }] },
  { id: '9', label: '9. Best language', options: [
    { v: 0, label: 'No aphasia, normal' }, { v: 1, label: 'Mild to moderate aphasia' }, { v: 2, label: 'Severe aphasia' },
    { v: 3, label: 'Mute, global aphasia' }] },
  { id: '10', label: '10. Dysarthria', options: [
    { v: 0, label: 'Normal' }, { v: 1, label: 'Mild to moderate' }, { v: 2, label: 'Severe, unintelligible or mute' },
    { v: 0, label: 'UN — intubated or other physical barrier', un: true }] },
  { id: '11', label: '11. Extinction and inattention', options: [
    { v: 0, label: 'No abnormality' }, { v: 1, label: 'Inattention or extinction in one modality' },
    { v: 2, label: 'Profound inattention, or in more than one modality' }] },
];

const nihss = {
  id: 'nihss', name: 'NIHSS', full: 'NIH Stroke Scale', group: 'stroke',
  source: 'Brott et al., Stroke 1989',
  note: 'Score what the patient does, not what you think they could do. UN items count 0.',
  items: NIHSS_ITEMS,
  result(values) {
    const n = total(this, values);
    const [, meaning, tone] = band(n, [[0, 'No stroke symptoms', 'good'], [4, 'Minor stroke', 'good'], [15, 'Moderate stroke', 'mid'], [20, 'Moderate to severe stroke', 'bad'], [42, 'Severe stroke', 'bad']]);
    return { big: String(n), unit: '/ 42', meaning, tone };
  },
};

const aspects = {
  id: 'aspects', name: 'ASPECTS', full: 'Alberta Stroke Program Early CT Score', group: 'stroke',
  source: 'Barber et al., Lancet 2000',
  note: 'Start at 10 and tick each MCA region with early ischaemic change on non-contrast CT.',
  items: [
    ['C', 'Caudate'], ['L', 'Lentiform nucleus'], ['IC', 'Internal capsule'], ['I', 'Insular ribbon'],
    ['M1', 'M1 — anterior MCA cortex'], ['M2', 'M2 — MCA cortex lateral to the insula'], ['M3', 'M3 — posterior MCA cortex'],
    ['M4', 'M4 — anterior MCA territory above M1'], ['M5', 'M5 — lateral MCA territory above M2'], ['M6', 'M6 — posterior MCA territory above M3'],
  ].map(([id, label]) => ({ id, short: id, label, kind: 'check', points: -1 })),
  result(values) {
    const n = 10 + total(this, values);
    const meaning = n >= 6 ? 'Smaller early infarct (6–10)' : 'Large early infarct (0–5)';
    return { big: String(n), unit: '/ 10', meaning, tone: n >= 8 ? 'good' : n >= 6 ? 'mid' : 'bad',
      lines: ['Lower scores mean more early ischaemic change. Many thrombectomy guidelines use ASPECTS 6 or more in the first 6 hours.'] };
  },
};

const abcd2 = {
  id: 'abcd2', name: 'ABCD²', full: 'ABCD² score for TIA', group: 'stroke',
  source: 'Johnston et al., Lancet 2007',
  items: [
    { id: 'age', label: 'Age 60 or older', options: yesNo(1) },
    { id: 'bp', label: 'BP 140/90 or higher at first assessment', options: yesNo(1) },
    { id: 'clin', label: 'Clinical features', options: [
      { v: 0, label: 'Other symptoms' }, { v: 1, label: 'Speech disturbance without weakness' }, { v: 2, label: 'Unilateral weakness' }] },
    { id: 'dur', label: 'Duration of symptoms', options: [
      { v: 0, label: 'Under 10 minutes' }, { v: 1, label: '10–59 minutes' }, { v: 2, label: '60 minutes or longer' }] },
    { id: 'dm', label: 'Diabetes', options: yesNo(1) },
  ],
  result(values) {
    const n = total(this, values);
    const [, meaning, tone, risk] = band(n, [[3, 'Low risk', 'good', '1.0%'], [5, 'Moderate risk', 'mid', '4.1%'], [7, 'High risk', 'bad', '8.1%']]);
    return { big: String(n), unit: '/ 7', meaning, tone, lines: [`Stroke risk in the next 2 days: about ${risk} (derivation cohorts).`] };
  },
};

const lysis = {
  id: 'lysis', name: 'Thrombolysis dose', full: 'Alteplase and tenecteplase dose by weight', group: 'stroke',
  source: 'AHA/ASA acute ischaemic stroke guideline 2019',
  note: 'Use the measured weight when you can. Check every dose against your hospital’s protocol before giving it.',
  items: [{ id: 'kg', label: 'Weight', kind: 'number', unit: 'kg', min: 20, max: 300, step: 0.5 }],
  result(values) {
    const kg = Number(values.kg);
    if (!(kg >= 20 && kg <= 300)) return { big: '—', meaning: 'Type a weight between 20 and 300 kg', tone: null };
    const alt = round1(Math.min(0.9 * kg, 90));
    const bolus = round1(alt * 0.1);
    const tnk = round1(Math.min(0.25 * kg, 25));
    return {
      big: `${alt} mg`, unit: 'alteplase', meaning: `Tenecteplase ${tnk} mg`, tone: null,
      lines: [
        `Alteplase 0.9 mg/kg (max 90 mg): ${alt} mg in total — ${bolus} mg IV bolus over 1 minute, then ${round1(alt - bolus)} mg infused over 60 minutes.${0.9 * kg > 90 ? ' (Capped at 90 mg.)' : ''}`,
        `Tenecteplase 0.25 mg/kg (max 25 mg): ${tnk} mg as a single IV bolus over 5 seconds.${0.25 * kg > 25 ? ' (Capped at 25 mg.)' : ''}`,
      ],
    };
  },
};

/* ---------- Bleeds and aneurysms ---------- */

const ich = {
  id: 'ich', name: 'ICH score', full: 'ICH score (intracerebral haemorrhage)', group: 'bleed',
  source: 'Hemphill et al., Stroke 2001',
  items: [
    { id: 'gcs', label: 'GCS', options: [{ v: 0, label: '13–15' }, { v: 1, label: '5–12' }, { v: 2, label: '3–4' }] },
    { id: 'vol', label: 'ICH volume 30 mL or more', hint: 'ABC/2 — there’s a calculator for it', options: yesNo(1) },
    { id: 'ivh', label: 'Intraventricular haemorrhage', options: yesNo(1) },
    { id: 'infra', label: 'Infratentorial origin', options: yesNo(1) },
    { id: 'age', label: 'Age 80 or older', options: yesNo(1) },
  ],
  result(values) {
    const n = total(this, values);
    const mortality = ['0%', '13%', '26%', '72%', '97%', '100%', '100% (estimated — no patients scored 6)'][n];
    return { big: String(n), unit: '/ 6', meaning: `30-day mortality ${n === 6 ? 'about 100%' : mortality}`, tone: n <= 1 ? 'good' : n <= 2 ? 'mid' : 'bad',
      lines: [`30-day mortality in the original cohort: ${mortality}.`, 'Don’t use it alone to limit care: early do-not-resuscitate orders make outcomes worse.'] };
  },
};

const abc2 = {
  id: 'abc2', name: 'ICH volume', full: 'ICH volume (ABC/2)', group: 'bleed',
  source: 'Kothari et al., Stroke 1996',
  note: 'A and B on the CT slice with the largest bleed; C = number of slices with blood × slice thickness.',
  items: [
    { id: 'a', label: 'A — largest diameter', kind: 'number', unit: 'cm', min: 0, max: 20, step: 0.1 },
    { id: 'b', label: 'B — diameter at 90° to A', kind: 'number', unit: 'cm', min: 0, max: 20, step: 0.1 },
    { id: 'c', label: 'C — vertical extent', kind: 'number', unit: 'cm', min: 0, max: 20, step: 0.1 },
  ],
  result(values) {
    const [a, b, c] = ['a', 'b', 'c'].map((k) => Number(values[k]));
    if (![a, b, c].every((x) => x > 0 && x <= 20)) return { big: '—', meaning: 'Type A, B and C in centimetres', tone: null };
    const ml = round1((a * b * c) / 2);
    return { big: String(ml), unit: 'mL', meaning: ml >= 30 ? '30 mL or more (1 point in the ICH score)' : 'Under 30 mL', tone: ml >= 30 ? 'bad' : 'mid' };
  },
};

const huntHess = {
  id: 'hunthess', name: 'Hunt & Hess', full: 'Hunt and Hess grade (subarachnoid haemorrhage)', group: 'bleed',
  source: 'Hunt & Hess, J Neurosurg 1968',
  items: [{ id: 'g', label: 'Clinical state', options: [
    { v: 1, label: 'Asymptomatic, or mild headache and slight neck stiffness' },
    { v: 2, label: 'Moderate to severe headache, neck stiffness, no deficit except a cranial nerve palsy' },
    { v: 3, label: 'Drowsy, confused, or a mild focal deficit' },
    { v: 4, label: 'Stupor, moderate to severe hemiparesis, possibly early decerebrate rigidity' },
    { v: 5, label: 'Deep coma, decerebrate rigidity, moribund appearance' }] }],
  result(values) {
    const n = total(this, values);
    return { big: `Grade ${['', 'I', 'II', 'III', 'IV', 'V'][n]}`, meaning: n <= 2 ? 'Good clinical grade' : n === 3 ? 'Intermediate grade' : 'Poor clinical grade', tone: n <= 2 ? 'good' : n === 3 ? 'mid' : 'bad' };
  },
};

const wfns = {
  id: 'wfns', name: 'WFNS', full: 'WFNS grade (subarachnoid haemorrhage)', group: 'bleed',
  source: 'Drake et al. (WFNS committee), J Neurosurg 1988',
  items: [
    { id: 'gcs', label: 'GCS', options: [{ v: 15, label: '15' }, { v: 13, label: '13–14' }, { v: 7, label: '7–12' }, { v: 3, label: '3–6' }] },
    { id: 'motor', label: 'Major motor deficit', hint: 'Only counts with GCS 13–15', options: yesNo(1), optional: (v) => v.gcs === 2 || v.gcs === 3 },
  ],
  result(values) {
    const gcs = pick(this.items[0], values)?.v;
    const motor = pick(this.items[1], values)?.v === 1;
    if (gcs === 15 && motor) return { big: '—', meaning: 'Not defined: WFNS has no grade for GCS 15 with a motor deficit', tone: null };
    const g = gcs === 15 ? 1 : gcs === 13 ? (motor ? 3 : 2) : gcs === 7 ? 4 : 5;
    return { big: `Grade ${['', 'I', 'II', 'III', 'IV', 'V'][g]}`, meaning: g <= 3 ? 'Good grade (I–III)' : 'Poor grade (IV–V)', tone: g <= 2 ? 'good' : g === 3 ? 'mid' : 'bad' };
  },
};

const mfisher = {
  id: 'mfisher', name: 'Modified Fisher', full: 'Modified Fisher scale (CT in subarachnoid haemorrhage)', group: 'bleed',
  source: 'Frontera et al., Neurosurgery 2006',
  items: [{ id: 'g', label: 'First CT', options: [
    { v: 0, label: 'No SAH, no IVH' },
    { v: 1, label: 'Thin (focal or diffuse) SAH, no IVH' },
    { v: 2, label: 'Thin SAH with IVH' },
    { v: 3, label: 'Thick SAH (fills at least one cistern or fissure), no IVH' },
    { v: 4, label: 'Thick SAH with IVH' }] }],
  result(values) {
    const n = total(this, values);
    const risk = ['0%', '24%', '33%', '33%', '40%'][n];
    return { big: `Grade ${n}`, meaning: `Symptomatic vasospasm about ${risk}`, tone: n <= 1 ? 'good' : n <= 3 ? 'mid' : 'bad',
      lines: [`Symptomatic vasospasm in the original cohort: ${risk}.`] };
  },
};

/* ---------- Consciousness and outcome ---------- */

const gcs = {
  id: 'gcs', name: 'GCS', full: 'Glasgow Coma Scale', group: 'coma',
  source: 'Teasdale & Jennett, Lancet 1974 (2014 wording)',
  items: [
    { id: 'e', short: 'E', label: 'Eye opening', options: [
      { v: 4, label: '4 — Spontaneous' }, { v: 3, label: '3 — To sound' }, { v: 2, label: '2 — To pressure' }, { v: 1, label: '1 — None' },
      { v: 0, label: 'NT — not testable (e.g. eyes swollen shut)', un: 'NT' }] },
    { id: 'v', short: 'V', label: 'Verbal response', options: [
      { v: 5, label: '5 — Oriented' }, { v: 4, label: '4 — Confused' }, { v: 3, label: '3 — Words' }, { v: 2, label: '2 — Sounds' }, { v: 1, label: '1 — None' },
      { v: 0, label: 'T — intubated or tracheostomy', un: 'T' }] },
    { id: 'm', short: 'M', label: 'Best motor response', options: [
      { v: 6, label: '6 — Obeys commands' }, { v: 5, label: '5 — Localising' }, { v: 4, label: '4 — Normal flexion (withdraws)' },
      { v: 3, label: '3 — Abnormal flexion' }, { v: 2, label: '2 — Extension' }, { v: 1, label: '1 — None' },
      { v: 0, label: 'NT — not testable', un: 'NT' }] },
  ],
  result(values) {
    const parts = this.items.map((it) => ({ it, o: pick(it, values) }));
    const n = parts.reduce((s, p) => s + (p.o?.v ?? 0), 0);
    const code = parts.map(({ it, o }) => `${it.short}${o?.un ? (o.un === 'T' ? 'T' : 'NT') : o?.v ?? '?'}`).join(' ');
    if (parts.some((p) => p.o?.un)) return { big: `${n}${parts.some((p) => p.o?.un === 'T') ? 'T' : ''}`, meaning: `${code} — a part couldn’t be tested, so the total isn’t a full GCS`, tone: null };
    const [, meaning, tone] = band(n, [[8, 'Severe (3–8)', 'bad'], [12, 'Moderate (9–12)', 'mid'], [15, 'Mild (13–15)', 'good']]);
    return { big: String(n), unit: '/ 15', meaning: `${code} · ${meaning}`, tone };
  },
};

const mrs = {
  id: 'mrs', name: 'mRS', full: 'Modified Rankin Scale', group: 'coma',
  source: 'Rankin 1957; van Swieten et al., Stroke 1988',
  items: [{ id: 'g', label: 'Level of disability', options: [
    { v: 0, label: '0 — No symptoms' },
    { v: 1, label: '1 — No significant disability: symptoms, but does all usual duties and activities' },
    { v: 2, label: '2 — Slight disability: can’t do all previous activities, but looks after own affairs without help' },
    { v: 3, label: '3 — Moderate disability: needs some help, but walks without assistance' },
    { v: 4, label: '4 — Moderately severe: can’t walk or attend to own bodily needs without assistance' },
    { v: 5, label: '5 — Severe disability: bedridden, incontinent, needs constant nursing care' },
    { v: 6, label: '6 — Dead' }] }],
  result(values) {
    const n = total(this, values);
    return { big: String(n), unit: '/ 6', meaning: n <= 2 ? 'Functional independence (0–2)' : n <= 5 ? 'Dependent (3–5)' : 'Dead', tone: n <= 1 ? 'good' : n <= 2 ? 'mid' : 'bad' };
  },
};

/* ---------- Atrial fibrillation ---------- */

const chads = {
  id: 'chads', name: 'CHA₂DS₂-VASc', full: 'CHA₂DS₂-VASc (stroke risk in atrial fibrillation)', group: 'af',
  source: 'Lip et al., Chest 2010',
  items: [
    { id: 'chf', label: 'Heart failure, or LV dysfunction', options: yesNo(1) },
    { id: 'htn', label: 'Hypertension', options: yesNo(1) },
    { id: 'age', label: 'Age', options: [{ v: 0, label: 'Under 65' }, { v: 1, label: '65–74' }, { v: 2, label: '75 or older' }] },
    { id: 'dm', label: 'Diabetes', options: yesNo(1) },
    { id: 'stroke', label: 'Stroke, TIA or thromboembolism before', options: yesNo(2) },
    { id: 'vasc', label: 'Vascular disease (MI, peripheral artery disease, aortic plaque)', options: yesNo(1) },
    { id: 'sex', label: 'Sex', options: [{ v: 0, label: 'Male' }, { v: 1, label: 'Female' }] },
  ],
  result(values) {
    const n = total(this, values);
    const female = values.sex === 1;
    const others = n - (female ? 1 : 0); // female sex only adds risk with another factor
    const meaning = others === 0 ? 'Low risk: no anticoagulation' : others === 1 ? 'Consider anticoagulation' : 'Anticoagulation recommended';
    return { big: String(n), unit: '/ 9', meaning, tone: others === 0 ? 'good' : others === 1 ? 'mid' : 'bad',
      lines: ['Female sex counts only alongside another risk factor (2020 ESC). The 2024 ESC guideline uses CHA₂DS₂-VA, which leaves sex out.'] };
  },
};

const hasbled = {
  id: 'hasbled', name: 'HAS-BLED', full: 'HAS-BLED (bleeding risk on anticoagulation)', group: 'af',
  source: 'Pisters et al., Chest 2010',
  items: [
    { id: 'h', label: 'Hypertension (uncontrolled, systolic over 160)', options: yesNo(1) },
    { id: 'renal', label: 'Abnormal kidney function (dialysis, transplant, creatinine ≥ 200 µmol/L)', options: yesNo(1) },
    { id: 'liver', label: 'Abnormal liver function (cirrhosis, or bilirubin > 2× and AST/ALT > 3× normal)', options: yesNo(1) },
    { id: 's', label: 'Stroke before', options: yesNo(1) },
    { id: 'b', label: 'Bleeding history or predisposition', options: yesNo(1) },
    { id: 'l', label: 'Labile INR (time in range under 60%)', options: yesNo(1) },
    { id: 'e', label: 'Elderly (over 65)', options: yesNo(1) },
    { id: 'drugs', label: 'Antiplatelets or NSAIDs', options: yesNo(1) },
    { id: 'alcohol', label: 'Alcohol (8 or more drinks a week)', options: yesNo(1) },
  ],
  result(values) {
    const n = total(this, values);
    return { big: String(n), unit: '/ 9', meaning: n >= 3 ? 'High bleeding risk' : 'Low to moderate bleeding risk', tone: n >= 3 ? 'bad' : n === 2 ? 'mid' : 'good',
      lines: ['A high score means fix what can be fixed and review more often — on its own it isn’t a reason to stop anticoagulation.'] };
  },
};

/* ---------- Vascular malformations ---------- */

const spetzler = {
  id: 'spetzler', name: 'Spetzler–Martin', full: 'Spetzler–Martin grade (brain AVM)', group: 'avm',
  source: 'Spetzler & Martin, J Neurosurg 1986; Spetzler & Ponce 2011',
  items: [
    { id: 'size', label: 'Nidus size', options: [{ v: 1, label: 'Under 3 cm' }, { v: 2, label: '3–6 cm' }, { v: 3, label: 'Over 6 cm' }] },
    { id: 'eloq', label: 'Eloquent location', hint: 'Sensorimotor, language or visual cortex, hypothalamus, thalamus, internal capsule, brainstem, cerebellar peduncles, deep cerebellar nuclei', options: yesNo(1) },
    { id: 'deep', label: 'Deep venous drainage', options: yesNo(1) },
  ],
  result(values) {
    const n = total(this, values);
    const cls = n <= 2 ? 'A' : n === 3 ? 'B' : 'C';
    return { big: `Grade ${['', 'I', 'II', 'III', 'IV', 'V'][n]}`, meaning: `Spetzler–Ponce class ${cls}`, tone: cls === 'A' ? 'good' : cls === 'B' ? 'mid' : 'bad',
      lines: [cls === 'A' ? 'Class A (I–II): surgery is usually favoured.' : cls === 'B' ? 'Class B (III): treatment is decided case by case, often with more than one approach.' : 'Class C (IV–V): usually managed without treatment, unless it keeps bleeding or symptoms progress.'] };
  },
};

export const GROUPS = [
  { id: 'stroke', name: 'Stroke' },
  { id: 'bleed', name: 'Bleeds and aneurysms' },
  { id: 'coma', name: 'Consciousness and outcome' },
  { id: 'af', name: 'Atrial fibrillation' },
  { id: 'avm', name: 'Vascular malformations' },
];

export const CALCULATORS = [nihss, aspects, abcd2, lysis, ich, abc2, huntHess, wfns, mfisher, gcs, mrs, chads, hasbled, spetzler];

export const calculator = (id) => CALCULATORS.find((c) => c.id === id) ?? null;

/** Every question answered (ticks never need answering)? */
export const isComplete = (calc, values) => answered(calc, values);

/** What to paste into notes: "NIHSS 7/42 — Moderate stroke (1a 0, 1b 1, …)", plus any detail lines for doses. */
export function resultText(calc, values) {
  const r = calc.result(values);
  const unit = !r.unit ? '' : r.unit.startsWith('/') ? r.unit.replace(/^\/ /, '/') : ` ${r.unit}`;
  let detail = '';
  if (calc.id === 'aspects') {
    const hit = calc.items.filter((it) => values[it.id]).map((it) => it.short);
    detail = hit.length ? `affected: ${hit.join(', ')}` : 'no regions affected';
  } else if (calc.id === 'nihss') {
    detail = calc.items.map((it) => { const o = pick(it, values); return `${it.id} ${o.un ? 'UN' : o.v}`; }).join(', ');
  } else if (calc.items.every((it) => it.kind === 'number')) {
    detail = calc.items.map((it) => `${it.label.split(' — ')[0]} ${values[it.id]} ${it.unit}`).join(', ');
  }
  const head = `${calc.name}${r.big === '—' ? '' : ` ${r.big}${unit}`} — ${r.meaning}${detail ? ` (${detail})` : ''}`;
  return calc.id === 'lysis' ? [head, ...r.lines].join('\n') : head;
}
