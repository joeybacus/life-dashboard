/* EEG Study Guide: the curriculum. Levels 0–9 teach, Level 10 is the case trials.
   Blocks: {h}, {p}, {ul}, {ol}, {tbl:{head, rows}}, {fig:"spec id"}, {pearl}, {trap}, {key}, {head:true} (electrode map),
   {bands:true} (frequency band drawing). Quiz and case options list the correct answer FIRST; the page shuffles them.
   Written for adults first. Sources: ACNS Standardized Critical Care EEG Terminology (2021); IFCN glossary and
   criteria for interictal epileptiform discharges (Kane et al., 2017); Salzburg consensus criteria for nonconvulsive
   status (2013, validated 2016); ACNS guidelines on montages and electrocerebral inactivity; ERC–ESICM post-resuscitation
   guidance (2021). Teaching summaries in our own words; check clinical decisions against current sources. */
(function () {
"use strict";

const RANKS = [
  {min:0, name:"Novice", line:"Every expert started by not knowing which way is up. (Negative is up.)"},
  {min:1, name:"Trainee", line:"You can find your way around the page."},
  {min:3, name:"Apprentice", line:"Normal awake and asleep records hold no secrets."},
  {min:5, name:"Reader", line:"You know what to ignore — the hardest skill in EEG."},
  {min:7, name:"Interpreter", line:"You can call slowing, discharges and seizures."},
  {min:10, name:"Electroencephalographer", line:"All ten levels cleared. The cases are waiting."},
  {min:11, name:"EEG Hero", line:"Levels and case trials cleared. Go read real EEGs — and write the report."}
];

const PLAN = [
  {when:"Weeks 1–2", what:"Levels 0–3", how:"Learn the page and the normal brain. Read 20 normal EEGs before naming a single abnormality, and say the 7-step read out loud each time."},
  {when:"Weeks 3–4", what:"Levels 4–5", how:"Artifacts and benign variants: the overcall list. Sit with a technologist for an hour, watch the video, and ask what each odd wave is."},
  {when:"Weeks 5–6", what:"Levels 6–7", how:"Slowing and epileptiform discharges. Localize every discharge you see in two montages and write down the electrode."},
  {when:"Weeks 7–8", what:"Levels 8–9", how:"Seizures, status and the ICU. Describe one continuous EEG a day with the ACNS terms, even when the attending doesn't ask."},
  {when:"Then", what:"Level 10", how:"Case trials, then real reports: write your own impression for every EEG you read and compare it with the final report."}
];

const L = [];

/* ================= Level 0 ================= */
L.push({id:"L0", title:"Orientation", sub:"What the EEG records and how the page is laid out", mins:20,
goals:["Say what makes the scalp EEG and what it cannot see","Name the 10–20 electrodes and their side","Know the four frequency bands","Read sensitivity, timebase and filters off the screen","Use the polarity rule: negative is up"],
blocks:[
 {h:"What the EEG records"},
 {p:"The scalp EEG is the summed <b>postsynaptic</b> potentials (excitatory and inhibitory) of cortical pyramidal neurons lined up side by side, not their action potentials. A discharge usually needs more than about 10 cm² of cortex firing together (often 10–20 cm²) to reach the scalp. Small or deep sources (mesial temporal, orbitofrontal, interhemispheric, insular) can fire without a trace on the scalp."},
 {ul:["Rhythms such as alpha and sleep spindles are paced by thalamocortical circuits; the brainstem arousal systems set the state, and state changes everything.","Skull and scalp blur and shrink the signal. Where bone is missing (a breach), activity is bigger, faster and sharper.","The EEG tests function at that moment. A normal EEG does not rule out epilepsy, and an abnormal one does not prove it."]},
 {h:"The 10–20 system"},
 {p:"Electrodes sit at 10% and 20% steps of the nasion–inion and ear-to-ear distances. The <b>letter</b> is the region, the <b>number</b> the side: odd = left, even = right, z = midline (zero). Numbers grow away from the midline."},
 {head:true},
 {tbl:{head:["Letter","Region"], rows:[["Fp","Frontopolar: also picks up every eye movement"],["F","Frontal (F7/F8: inferior frontal and anterior temporal)"],["C","Central: over the rolandic strip, not a lobe"],["T","Temporal"],["P","Parietal (P7/P8: posterior temporal)"],["O","Occipital"],["A or M","Ear (auricular) or mastoid: reference electrodes"]]}},
 {p:"Old names are still common: <b>T3 = T7, T4 = T8, T5 = P7, T6 = P8</b>. Every tracing here has an Old names button to switch."},
 {pearl:"Anterior temporal (mesial temporal) discharges show best at F7/F8 and T7/T8, and better still with extra inferior temporal electrodes (T1/T2, F9/F10, T9/T10). F7 and F8 sit over the anterior temporal lobe as much as the frontal lobe."},
 {h:"Frequency bands"},
 {bands:true},
 {tbl:{head:["Band","Range","Where you meet it"], rows:[["Delta","under 4 Hz","Deep sleep. Awake: abnormal (focal = structural; generalized = encephalopathy)"],["Theta","4 to under 8 Hz","Drowsiness; a little is normal in young adults; excess when alert = slowing"],["Alpha","8–13 Hz","Posterior dominant rhythm (eyes closed); mu rhythm (central)"],["Beta","over 13 Hz","Frontocentral; more with benzodiazepines and barbiturates"],["Gamma","over 30 Hz","On the scalp, mostly muscle artifact"]]}},
 {p:"Count frequency by counting waves between two 1-second grid lines, or time one wave: 100 ms = 10 Hz, 250 ms = 4 Hz, 500 ms = 2 Hz."},
 {h:"Reading the display"},
 {tbl:{head:["Setting","Usual","What it does"], rows:[["Sensitivity","7 µV/mm","A lower number makes traces bigger. Electrocerebral inactivity recordings use 2 µV/mm."],["Timebase","30 mm/s, 10-second page","Compress it (15 mm/s, 20-second page) for slow and periodic patterns; stretch it for spikes."],["Low-frequency filter (high-pass)","1 Hz (0.5 Hz)","A higher setting removes sweat and drift but can hide real delta."],["High-frequency filter (low-pass)","70 Hz","A lower setting (15–35 Hz) blunts muscle but can turn it into fake beta or spikes."],["Notch","60 Hz (50 Hz in some countries)","Removes mains hum."]]}},
 {trap:"Filters change shape. A 15 Hz high-frequency filter can turn muscle into sharp, spike-like waves. Read with standard settings first, then change one thing at a time."},
 {h:"The polarity rule: learn it today"},
 {p:"Every channel shows <b>input 1 minus input 2</b>, and by convention a negative difference goes <b>up</b>. So a channel deflects up when input 1 is more negative than input 2, or when input 2 is more positive than input 1. That one sentence explains phase reversals, eye artifacts and lambda waves."},
 {key:"Most cortical discharges (spikes, sharp waves) are surface-negative. Eye artifacts and a few normal transients (POSTS, lambda) are positive."}
],
quiz:[
 {q:"Which electrode is the right posterior temporal one (old name T6)?", o:["P8","P7","T8","O2"], why:"Even numbers are right. P8 is the new name for T6; P7 (T5) is its left partner, T8 (T4) is right mid-temporal."},
 {q:"Which of these contributes least to the scalp EEG?", o:["Axonal action potentials","Excitatory postsynaptic potentials of pyramidal cells","Inhibitory postsynaptic potentials of pyramidal cells","Synchronized dendritic currents in parallel neurons"], why:"Action potentials are too brief and not summed in parallel; the EEG is mainly synchronized postsynaptic (dendritic) currents of pyramidal cells."},
 {q:"A channel deflects upward. What does that mean?", o:["Input 1 is negative relative to input 2","Input 1 is positive relative to input 2","Both inputs are negative","It is artifact"], why:"By convention, negative is up: input 1 minus input 2 is negative."},
 {q:"Each wave in a run lasts about 200 ms. Which band is it?", o:["Theta (5 Hz)","Delta","Alpha","Beta"], why:"1 second ÷ 0.2 seconds = 5 Hz, which is theta (4 to under 8 Hz)."},
 {q:"You lower the high-frequency filter to 15 Hz to clean up a noisy temporal channel. The main risk?", o:["Muscle artifact starts to look like sharp waves or spikes","Real spikes become bigger","Delta disappears","The montage changes"], why:"Low-pass filtering smooths fast muscle bursts into rounded, sharp-looking waves that can be mistaken for discharges."},
 {q:"Roughly how much cortex must discharge together for a spike to reach the scalp?", o:["About 10 cm² or more","About 1 mm²","About 1 cm²","A whole lobe"], why:"In simultaneous scalp and intracranial recordings (Tao et al., 2005), about 90% of spikes with a source over 10 cm² reached the scalp, but only about 10% of smaller ones did."}
]});

/* ================= Level 1 ================= */
L.push({id:"L1", title:"Montages and localization", sub:"Bipolar, referential, phase reversal and the field", mins:25,
goals:["Explain bipolar and referential montages","Localize a discharge by phase reversal","Recognize end-of-chain maxima","Spot a contaminated reference","Use the field to tell brain from artifact"],
blocks:[
 {h:"Two ways to wire a channel"},
 {ul:["<b>Bipolar</b>: neighbouring electrodes in chains, front to back (longitudinal, the 'double banana') or left to right (transverse). Good at sharp local gradients; poor at showing true amplitude, and it can cancel a broad field.","<b>Referential</b>: every electrode against one reference (ear, Cz, the average of all). Shows true shape and amplitude, provided the reference is quiet."]},
 {h:"Phase reversal (bipolar)"},
 {p:"In a chain, the electrode at the peak appears twice: as input 2 in the channel before it and input 1 in the channel after. Those two channels move in opposite directions: a <b>phase reversal</b>. Pens pointing <b>toward</b> each other means the peak is negative (most discharges); <b>away</b> from each other means positive."},
 {fig:"ats"},
 {ol:["Find the two channels that move in opposite directions at the same moment.","The electrode they share is the maximum.","Confirm in the other chains (parasagittal, transverse) and in a referential montage.","Check the field: neighbours should take part, less strongly."]},
 {h:"End of chain"},
 {p:"If the maximum is at the first or last electrode of a chain (Fp1/Fp2 or O1/O2) there is nothing beyond it to reverse against: you just see the biggest deflection in the end channel. Look again in a transverse or referential montage."},
 {h:"Referential montages: no reference is truly silent"},
 {ul:["<b>Ear (A1/A2)</b>: fine for central and parasagittal activity, but the ear sits next to the temporal lobe. A temporal discharge makes A1 active, so the left channels shrink or even flip. Mesial temporal spikes are the classic victim.","<b>Average</b>: a big discharge contaminates the average and appears small and inverted in far-away channels.","<b>Cz</b>: good for temporal activity, poor for vertex waves and anything central."]},
 {pearl:"Referential: the maximum is the tallest deflection, if the reference is not involved. Bipolar: the maximum is the phase reversal. Always check in two montages."},
 {h:"The field: the test of reality"},
 {p:"Cerebral potentials spread to neighbouring electrodes with a smooth gradient: a <b>field</b>. A deflection limited to one electrode, with nothing in its neighbours, is almost always artifact, even though it phase-reverses."},
 {fig:"pop"}
],
quiz:[
 {q:"Double banana: Fp1–F7 goes down and F7–T7 goes up at the same moment. Where is the maximum, and what polarity?", o:["F7, negative","F7, positive","Fp1, negative","T7, positive"], why:"Fp1–F7 down: F7 is more negative than Fp1. F7–T7 up: F7 is more negative than T7. The pens point at each other at F7: a negative phase reversal."},
 {q:"A left temporal spike looks small in the left ear-referenced channels but obvious in the average reference. Why?", o:["A1 picks up the spike, so it is subtracted from every left channel","The spike is positive","The ear reference uses a lower sensitivity","Average references amplify spikes"], why:"An active reference: the ear lies over the temporal lobe and shares the field, so electrode minus A1 shrinks."},
 {q:"F8–T8 goes up and T8–P8 goes down, and nothing else moves anywhere. Most likely?", o:["An electrode problem at T8","A right mid-temporal spike","A right temporal seizure","Eye movement"], why:"A single electrode with no field is the electrode, not the brain (an electrode pop)."},
 {q:"A discharge is maximal at O2. What do you see in the double banana?", o:["No phase reversal; the biggest deflection is in the P8–O2 and P4–O2 channels","A phase reversal at P8","A phase reversal at O1","Nothing: occipital discharges are invisible"], why:"End of chain: O2 is the last electrode, so there is no channel after it to reverse against."},
 {q:"Fp2–F8 goes up and F8–T8 goes down (pens pointing away from each other). What is at F8?", o:["A positive maximum","A negative maximum","Nothing: the two cancel","An end-of-chain discharge"], why:"Fp2–F8 up means F8 is more positive than Fp2; F8–T8 down means F8 is more positive than T8. Positive phase reversals at F8 happen when the eyes look right."}
]});

/* ================= Level 2 ================= */
L.push({id:"L2", title:"The normal awake adult", sub:"The 7-step read and the posterior dominant rhythm", mins:25,
goals:["Run the 7-step read on any record","Know normal PDR frequency, amplitude, symmetry and reactivity","Recognize beta, mu and lambda waves","Know what hyperventilation and photic stimulation should and shouldn't do"],
blocks:[
 {h:"The 7-step read: use it every time"},
 {ol:["<b>Context</b>: age, state (awake, drowsy, asleep, sedated), medications, why the study was done.","<b>Technical</b>: montage, sensitivity, filters, bad electrodes, artifacts.","<b>Background</b>: PDR frequency, amplitude, reactivity and symmetry; front-to-back gradient; continuity and variability.","<b>Sleep</b>: which stages, and are spindles, vertex waves and K-complexes normal and symmetric?","<b>Abnormalities</b>: slowing (focal or generalized, intermittent or continuous), epileptiform discharges, rhythmic or periodic patterns, seizures.","<b>Activation</b>: hyperventilation, photic stimulation, sleep.","<b>Impression</b>: normal or abnormal, the findings in plain words, and what they mean for this patient."]},
 {h:"Posterior dominant rhythm (PDR)"},
 {ul:["Adults: <b>8.5–11 Hz</b> over O1/O2, best with the eyes closed and relaxed. Below 8 Hz in an alert adult is slowing; a healthy 80-year-old should still be at 8 Hz or more.","Amplitude usually 20–60 µV, often a little higher on the right. An amplitude difference over about 50%, or a frequency difference of about 1 Hz or more between sides, is abnormal.","<b>Reactivity</b>: attenuates with eye opening, alerting and mental effort. A side that fails to block (Bancaud phenomenon) points to a lesion on that side.","Variants: <b>slow alpha variant</b> (half frequency, notched 4–5 Hz, reacting like alpha) and <b>fast alpha variant</b> (double frequency) are normal.","Low-voltage records (everything under 20 µV) can be normal in adults."]},
 {fig:"pdr"},
 {h:"Other normal awake activity"},
 {ul:["<b>Beta</b>: 13–25 Hz, usually under 20 µV, frontocentral. More with benzodiazepines and barbiturates.","<b>Front-to-back gradient</b>: faster and smaller in front, slower and bigger behind. Losing it (alpha spreading forward) is seen in drowsiness, sedation and alpha coma.","<b>Mu</b>: 7–11 Hz arch-shaped waves at C3/C4 that block with movement (or the thought of it) of the opposite limb, not with eye opening.","<b>Lambda waves</b>: positive, triangular occipital waves while visually scanning (reading, looking at a busy picture).","A little frontocentral theta is normal, especially in young adults; plenty of it in an alert adult is not."]},
 {fig:"mu"},
 {fig:"lambda"},
 {h:"Activation procedures"},
 {ul:["<b>Hyperventilation</b> (3–5 minutes): diffuse slowing ('build-up') is normal, more so in the young and with low blood glucose, and should settle within about a minute of stopping. It provokes absence seizures in most untreated typical absence epilepsy. Avoid it after recent stroke or subarachnoid haemorrhage, with significant heart or lung disease, sickle cell disease, moyamoya, raised intracranial pressure and late pregnancy.","<b>Photic stimulation</b> (flashes from 1 Hz up to about 30 Hz, or to 60 Hz in the IFCN protocol): driving is normal and its absence means nothing. A photoparoxysmal response (generalized spike-and-wave, especially if it outlasts the flashes) is abnormal. Frontal muscle twitches locked to the flashes (photomyogenic response) are benign.","<b>Sleep</b> and sleep deprivation raise the yield of interictal discharges."]},
 {fig:"photic"}
],
quiz:[
 {q:"An alert 45-year-old has a reactive, symmetric PDR of 7 Hz. Your reading?", o:["Abnormal: mild generalized slowing","Normal for age","Normal if the patient is anxious","Normal: alpha is 7–13 Hz"], why:"An adult PDR should be at least 8.5 Hz (8 Hz is borderline). 7 Hz in an alert adult is slowing."},
 {q:"The left PDR fails to attenuate with eye opening while the right blocks normally. This suggests:", o:["A lesion on the left (Bancaud phenomenon)","A lesion on the right","Drowsiness","Normal asymmetry"], why:"Failure of the alpha to react on one side points to dysfunction on that side, even when the amplitude is preserved."},
 {q:"Which normal rhythm blocks when the patient clenches the opposite fist, but not with eye opening?", o:["Mu rhythm","Posterior dominant rhythm","Lambda waves","Frontal beta"], why:"Mu is a sensorimotor rhythm over C3/C4 that blocks with movement or the intention to move."},
 {q:"With flashes at 16 Hz, generalized spike-and-wave appears and continues for 1 second after the flashes stop. Your reading?", o:["Abnormal photoparoxysmal response","Normal photic driving","Photomyogenic response","Artifact"], why:"Generalized epileptiform discharges triggered by flashes, outlasting them, are a photoparoxysmal response, typical of idiopathic generalized epilepsies such as juvenile myoclonic epilepsy."},
 {q:"In which patient should you avoid hyperventilation?", o:["A 60-year-old with a subarachnoid haemorrhage last week","A 20-year-old with suspected absence seizures","A 35-year-old with a normal heart","A 50-year-old on levetiracetam"], why:"Hypocapnia causes cerebral vasoconstriction; avoid hyperventilation after recent stroke or SAH, with moyamoya, sickle cell disease, raised ICP or significant cardiopulmonary disease."}
]});

/* ================= Level 3 ================= */
L.push({id:"L3", title:"Normal sleep", sub:"Drowsiness, N2, N3 and REM: the normal sharp waves", mins:20,
goals:["Recognize drowsiness early","Identify vertex waves, POSTS, spindles and K-complexes","Know what N3 and REM look like","Avoid calling normal sleep transients epileptiform"],
blocks:[
 {p:"Sleep brings out interictal discharges (especially in NREM), and normal sleep transients are among the most overcalled 'sharp waves'. Know the normal ones cold."},
 {tbl:{head:["Stage","EEG","Watch out for"], rows:[
  ["N1 (drowsiness)","Alpha drops out (under half the epoch), low-voltage mixed theta; slow rolling lateral eye movements; vertex waves; POSTS","RMTD, wicket spikes and small sharp spikes live here"],
  ["N2","Sleep spindles (11–16 Hz, usually 12–14, central, at least 0.5 s); K-complexes","Spindle asymmetry; K-complexes can look sharp"],
  ["N3","Delta 0.5–2 Hz over 75 µV in at least 20% of the epoch","The same delta awake would be severe encephalopathy"],
  ["REM","Low-voltage mixed frequencies, sawtooth waves (2–6 Hz at the vertex), rapid eye movements, low chin muscle tone","REM within 15 minutes of falling asleep on a routine EEG: sleep deprivation, narcolepsy, withdrawal of REM-suppressing drugs"]]}},
 {fig:"drowsy"},
 {fig:"vertex"},
 {fig:"n2"},
 {fig:"n3"},
 {pearl:"Vertex waves are symmetric and at Cz. A 'vertex wave' that is consistently bigger on one side, has an after-going slow wave and disrupts the background deserves a second look."},
 {pearl:"Adult spindles are symmetric and synchronous. Spindles persistently missing on one side suggest thalamic or hemispheric dysfunction on that side."},
 {trap:"Hypnagogic hypersynchrony (bursts of high-voltage theta in drowsiness) is normal in children and is not epileptiform. It is rare in adults."}
],
quiz:[
 {q:"Where are sleep spindles maximal?", o:["Central (C3, Cz, C4)","Occipital","Anterior temporal","Frontopolar"], why:"Spindles are maximal centrally, usually 12–14 Hz, and should be symmetric in adults."},
 {q:"A sharp, negative, symmetric wave maximal at Cz during drowsiness is most likely:", o:["A vertex wave","A centrotemporal spike","A K-complex","Mu"], why:"Vertex waves are normal N1–N2 transients, maximal at the vertex, and can be sharp in young adults."},
 {q:"Positive, triangular waves at O1/O2 in light sleep are:", o:["POSTS","Occipital spikes","Lambda waves","Alpha"], why:"Positive occipital sharp transients of sleep. Lambda waves look alike but occur awake during visual scanning."},
 {q:"Which is usually the first sign of drowsiness?", o:["Alpha drops out, with slow rolling eye movements","Sleep spindles","K-complexes","High-voltage delta"], why:"Alpha dropout and slow lateral eye movements mark N1; spindles and K-complexes mark N2."},
 {q:"You see 1 Hz delta over 150 µV in a patient you assumed was awake. First step?", o:["Establish the state: is the patient actually asleep?","Report severe encephalopathy","Report focal slowing","Report a seizure"], why:"High-voltage delta is N3 sleep if asleep and severe encephalopathy if truly awake. State first, always."}
]});

/* ================= Level 4 ================= */
L.push({id:"L4", title:"Artifacts", sub:"Eyes, muscle, heart and electrodes", mins:25,
goals:["Recognize eye blinks and lateral eye movements by polarity","Recognize muscle, chewing and glossokinetic artifact","Line up EKG and pulse artifact","Spot single-electrode and device artifacts"],
blocks:[
 {h:"The rule of fields"},
 {p:"Brain potentials have a physiological field and a plausible frequency. Artifacts break the rules: one electrode only, an impossible frequency, perfect regularity, or a lock to something outside the brain (the heartbeat, breathing, a movement, a pump)."},
 {tbl:{head:["Artifact","How it looks","Clue"], rows:[
  ["Eye blink","Positive (downward) at Fp1/Fp2, symmetric, 200–400 ms","Bell phenomenon; Fp only, sharp fall-off behind"],
  ["Lateral eye movement","Opposite phase reversals at F7 and F8","The eyes look toward the positive side"],
  ["Slow rolling eye movements","Slow (0.2–0.5 Hz) version of the same at F7/F8","Drowsiness"],
  ["Muscle","Very fast (mostly over 20 Hz), spiky, temporal and frontal","Jaw clenching; chewing gives rhythmic bursts"],
  ["Glossokinetic","Diffuse delta, frontal and temporal, with tongue movement","The tongue tip is negative; ask the patient to say 'la la la'"],
  ["EKG","Small sharp blips at the heart rate","Line up with the QRS; worse with ear references"],
  ["Pulse","Slow wave just after each QRS at one electrode","Electrode on an artery: move it"],
  ["Electrode pop","Sudden steep jump at one electrode","No field"],
  ["Sweat","Very slow (under 0.5 Hz) swaying baseline","Hot room; the low-frequency filter hides it"],
  ["Mains (60 Hz)","Thick, uniform fast fuzz","High impedance; the notch filter removes it"],
  ["Tremor and movement","Rhythmic 4–6 Hz (tremor) or irregular swings","Watch the video and the patient"],
  ["ICU devices","Perfectly regular patterns from IV pumps, ventilators, oscillating beds, dialysis","Exact regularity; stops when the device stops"]]}},
 {fig:"blink"},
 {fig:"lateral"},
 {fig:"muscle"},
 {fig:"ecg"},
 {fig:"pop"},
 {pearl:"Watch the video. Most 'rhythmic' ICU patterns that look too perfect are devices."}
],
quiz:[
 {q:"Why does a blink show as a downward deflection in Fp1–F7?", o:["The eyes roll up, bringing the positive cornea under Fp1","The eyelid muscle is negative","The retina is positive","It is a frontal slow wave"], why:"The eye is a dipole with a positive cornea. In a blink the eyes roll up (Bell phenomenon), so Fp1 becomes positive and Fp1 minus F7 is positive: down."},
 {q:"F8 shows a positive phase reversal while F7 shows a negative one. The patient is:", o:["Looking to the right","Looking to the left","Blinking","Chewing"], why:"The eyes look toward the side that goes positive (the cornea moves toward F8)."},
 {q:"Regular sharp transients every 0.8 seconds line up exactly with the QRS. They are:", o:["EKG artifact","Periodic discharges","Pulse artifact","Electrode pops"], why:"Anything locked to the QRS is EKG artifact. Pulse artifact is a slow wave just after the QRS at one electrode."},
 {q:"Rhythmic frontal and temporal delta appears every time the patient talks. Most likely:", o:["Glossokinetic artifact","FIRDA","Temporal intermittent rhythmic delta","A seizure"], why:"The tongue is a dipole with a negative tip; tongue movement produces delta-range artifact. Test with 'la la la'."},
 {q:"An ICU patient on an oscillating bed has 'rhythmic delta' at exactly 1 Hz in a few posterior channels. Most likely:", o:["Device artifact","Lateralized rhythmic delta activity","Seizure","Pulse artifact"], why:"Perfect regularity in a few channels with no physiological field suggests a device. Pause the bed if safe and watch it disappear."}
]});

/* ================= Level 5 ================= */
L.push({id:"L5", title:"Benign variants", sub:"The overcall list: sharp but harmless", mins:20,
goals:["Name the benign variants of adults and when they appear","Tell wicket spikes and small sharp spikes from real discharges","Know FOLD versus WHAM for 6 Hz spike-and-wave","Recognize breach rhythm and SREDA"],
blocks:[
 {p:"These patterns are sharp or rhythmic but carry no link with epilepsy. Most appear in drowsiness or light sleep. Overreading them, together with normal sleep transients, is the commonest reason for a wrong diagnosis of epilepsy."},
 {tbl:{head:["Variant","Who and when","Looks like","Tells it apart"], rows:[
  ["Wicket spikes","Adults over 30, drowsy","6–11 Hz arch-shaped waves, temporal, single or in trains, either side","No after-going slow wave, no disruption; same shape as the trains"],
  ["Small sharp spikes (BSSS, BETS)","Adults, drowsy and light sleep","Under 50 µV, under 50 ms, mono- or diphasic, temporal, broad field, shifting sides","Tiny and brief; gone in deeper sleep"],
  ["6 Hz spike-and-wave (phantom)","Adolescents and adults, drowsy","Brief bursts (about 1–2 s) of 5–7 Hz with a tiny spike","FOLD (female, occipital, low amplitude, drowsy): benign. WHAM (wake, high amplitude, anterior, male): more often linked to seizures"],
  ["14 and 6 Hz positive spikes","Adolescents and young adults, drowsy","Comb-shaped positive bursts, posterior temporal","Positive; best seen in a contralateral ear reference"],
  ["Rhythmic mid-temporal theta of drowsiness (RMTD)","Adolescents and adults, drowsy","Runs of 5–7 Hz notched theta, mid-temporal","Monomorphic, never evolves"],
  ["SREDA","Over 50, awake (rest, hyperventilation)","Sudden rhythmic sharply contoured theta–delta, parietal and posterior temporal, both sides, 40–80 s; can seem to evolve","No symptoms, normal immediately after, no postictal slowing"],
  ["Midline theta (Ciganek)","Adults, awake or drowsy","5–7 Hz rhythmic theta at Cz","Midline, waxing and waning"],
  ["Breach rhythm","Skull defect, craniotomy","Bigger, faster, sharper activity over the defect","Know the history; discharges there must stand out from it"]]}},
 {fig:"wicket"},
 {fig:"sss"},
 {fig:"phantom"},
 {fig:"rmtd"},
 {fig:"breach"},
 {pearl:"When in doubt, don't call it. A sharp transient of uncertain significance is better described than labelled epileptiform: a false diagnosis of epilepsy means years of drugs, driving restrictions and stigma."}
],
quiz:[
 {q:"A drowsy 62-year-old has trains and single arch-shaped 8 Hz waves in the left temporal channels, with no slow wave after them. Your reading?", o:["Wicket spikes: benign","Left temporal spikes","Temporal intermittent rhythmic delta","Mu rhythm"], why:"Wicket spikes: adults over 30, drowsiness, arciform, no after-going slow wave and no disruption of the background."},
 {q:"Which features fit small sharp spikes?", o:["Under 50 µV and under 50 ms, in drowsiness or light sleep","Over 100 µV with a big slow wave","Awake only, occipital","Generalized at 3 Hz"], why:"Small sharp spikes are tiny, brief, occur in drowsiness or light sleep in adults, and fade in deeper sleep."},
 {q:"6 Hz spike-and-wave in an awake man: high amplitude and frontal. Significance?", o:["The WHAM type: more often associated with seizures","The FOLD type: benign","Always benign","Diagnostic of absence epilepsy"], why:"WHAM (wake, high amplitude, anterior, male) carries a higher association with seizures than the FOLD type."},
 {q:"A 70-year-old at rest develops rhythmic, sharply contoured bilateral parietal theta for 60 seconds that seems to evolve. There are no symptoms and the record is normal right after. Most likely:", o:["SREDA","A focal seizure","Nonconvulsive status","FIRDA"], why:"Subclinical rhythmic electrographic discharge of adults: older adults, at rest or with hyperventilation, no clinical change and no postictal slowing."},
 {q:"After a right craniotomy, activity over the defect is higher, faster and sharper. Best description?", o:["Breach rhythm","Right hemispheric spikes","Right attenuation","Mu rhythm"], why:"Missing bone filters less. Call discharges there only if they clearly stand out from the breach activity."}
]});

/* ================= Level 6 ================= */
L.push({id:"L6", title:"Abnormal, not epileptiform", sub:"Slowing, asymmetry, rhythmic delta and drug effects", mins:20,
goals:["Separate focal from generalized slowing and know what each means","Grade encephalopathy on EEG","Recognize FIRDA and why it is not a seizure","Read asymmetry and drug beta"],
blocks:[
 {h:"Slowing: where, how much, how often"},
 {tbl:{head:["Pattern","Means"], rows:[
  ["Focal polymorphic delta, continuous","Structural lesion of the underlying white matter: infarct, tumour, abscess, haemorrhage, contusion"],
  ["Focal slowing, intermittent","Less specific: also postictal, migraine, focal epilepsy (especially temporal)"],
  ["Generalized slowing","Diffuse dysfunction: toxic-metabolic, drugs, sepsis, postictal, neurodegenerative, diffuse structural disease. Severity tracks the clinical state"],
  ["Asymmetry, lower on one side","Fluid between cortex and electrode (subdural, effusion), scalp swelling, large cortical infarct"],
  ["Asymmetry, higher on one side","Usually a breach (skull defect)"],
  ["FIRDA (ACNS: GRDA, frontally predominant)","Encephalopathy, raised intracranial pressure, deep midline lesions. Not epileptiform"],
  ["OIRDA (occipital)","Children with absence epilepsy"],
  ["TIRDA (temporal)","Epileptiform equivalent for temporal lobe epilepsy (Level 7)"],
  ["Excess beta","Benzodiazepines, barbiturates, propofol. A focal lack of drug beta suggests cortical dysfunction on that side"]]}},
 {fig:"focalslow"},
 {fig:"diffslow"},
 {h:"Grading encephalopathy"},
 {tbl:{head:["Grade","EEG"], rows:[["Mild","PDR 7–8 Hz or less organized, some diffuse theta, reactive"],["Moderate","Theta dominant with some delta, PDR lost or under 7 Hz, still reactive"],["Severe","Delta dominant, little reactivity or variability, may be discontinuous"],["Very severe","Burst suppression, suppression under 10 µV, unreactive"]]}},
 {p:"Grading schemes differ between centres; describe frequency, reactivity, variability and continuity, and the grade follows."},
 {fig:"firda"},
 {fig:"asym"},
 {fig:"drugbeta"},
 {pearl:"Reactivity and variability are the best EEG signs of recoverable brain function in coma. An unreactive, invariant background is worrying."},
 {trap:"FIRDA is not a seizure: it is sinusoidal, monomorphic, comes and goes and never evolves."}
],
quiz:[
 {q:"Continuous, irregular 1–3 Hz delta over the left temporal region in an alert patient suggests:", o:["A structural lesion in the left hemisphere","Normal drowsiness","Benign variant","Left temporal seizures"], why:"Continuous polymorphic focal delta is the EEG sign of a structural lesion involving the underlying white matter. Image the brain."},
 {q:"Bursts of 2.5 Hz sinusoidal delta, frontal and bilateral, in a uraemic, confused patient. Your reading?", o:["FIRDA (GRDA): nonspecific encephalopathy","Nonconvulsive status","Frontal lobe seizures","Temporal intermittent rhythmic delta"], why:"Frontally predominant generalized rhythmic delta is a nonspecific sign of encephalopathy and is not associated with seizures."},
 {q:"Every frequency is lower in amplitude over the right hemisphere in an 81-year-old on an anticoagulant who fell. Think of:", o:["A right subdural haematoma","A right skull defect","Right-sided drug effect","Normal asymmetry"], why:"Reduced amplitude on one side means something between cortex and electrode (blood, fluid) or loss of cortex."},
 {q:"Which finding points most to recoverable function in a comatose patient?", o:["A reactive, variable background","Generalized delta","Burst suppression","Low voltage"], why:"Reactivity to stimulation and spontaneous variability are favourable signs."},
 {q:"A patient on lorazepam has abundant beta everywhere except over the left hemisphere. This suggests:", o:["Left cortical dysfunction","A normal drug effect","Right-sided seizures","A breach on the left"], why:"Drug beta comes from healthy cortex. A focal lack of it points to cortical dysfunction (lesion, fluid) on that side."}
]});

/* ================= Level 7 ================= */
L.push({id:"L7", title:"Epileptiform discharges", sub:"Spikes, sharp waves and adult epilepsy syndromes", mins:30,
goals:["Apply the IFCN criteria to a sharp transient","Tell spikes from sharp waves","Localize focal discharges in adults","Recognize 3 Hz spike-and-wave and polyspike-and-wave","Know what one EEG can and cannot tell you"],
blocks:[
 {h:"What makes a discharge epileptiform (IFCN, 2017)"},
 {ol:["Di- or triphasic, with a sharp or spiky (pointed) peak.","Different duration from the ongoing background, shorter or longer.","Asymmetric waveform: a sharply rising phase and a slower falling phase, or the reverse.","Followed by an after-going slow wave.","Disrupts the surrounding background.","A distribution of negative and positive potentials on the scalp that fits a source in the brain (a physiological field)."]},
 {p:"Most true interictal discharges meet at least four of these, and the more they meet, the surer you can be. Normal sharp transients and benign variants usually fail criteria 4 and 5: no after-going slow wave and no disruption of the background."},
 {tbl:{head:["Term","Definition"], rows:[["Spike","20 to under 70 ms"],["Sharp wave","70–200 ms"],["Spike-and-wave","A spike followed by a slow wave"],["Polyspike(-and-wave)","Two or more spikes in a row (then a slow wave)"]]}},
 {p:"Spikes and sharp waves mean the same thing clinically."},
 {h:"Focal discharges in adults"},
 {tbl:{head:["Location","Maximum at","Points to"], rows:[
  ["Anterior temporal","F7/F8, T7/T8 (T1/T2, sphenoidal)","Temporal lobe epilepsy, usually mesial (hippocampal sclerosis): the commonest focal epilepsy in adults"],
  ["Mid or posterior temporal","T7/T8, P7/P8","Neocortical temporal epilepsy"],
  ["Frontal","Fp1/Fp2, F3/F4, Fz","Frontal lobe epilepsy (often hard to see on the scalp: mesial and orbital sources)"],
  ["Central","C3/C4","Perirolandic; in children, self-limited epilepsy with centrotemporal spikes"],
  ["Occipital","O1/O2","Occipital lobe epilepsy (don't confuse with POSTS or lambda waves)"],
  ["Temporal rhythmic delta (TIRDA)","Temporal","The same meaning as temporal spikes"],
  ["Multifocal","Many places","Multifocal or diffuse disease, developmental and epileptic encephalopathies"]]}},
 {fig:"ats"},
 {fig:"tirda"},
 {h:"Generalized discharges"},
 {tbl:{head:["Pattern","Features","Syndrome"], rows:[
  ["Spike-and-wave","3 Hz (2.5–4), abrupt, symmetric, frontally maximal, provoked by hyperventilation","Childhood and juvenile absence epilepsy"],
  ["Polyspike-and-wave","4–6 Hz, irregular, fragmentary, often photosensitive","Juvenile myoclonic epilepsy; epilepsy with generalized tonic–clonic seizures alone"],
  ["Slow spike-and-wave","Under 2.5 Hz (1.5–2.5)","Lennox–Gastaut syndrome (persists into adult life)"],
  ["Generalized paroxysmal fast activity","10–25 Hz bursts in sleep","Lennox–Gastaut syndrome (tonic seizures)"]]}},
 {fig:"gsw3"},
 {fig:"pspw"},
 {h:"How much does one EEG tell you?"},
 {ul:["A first routine EEG shows interictal discharges in only about a third to a half of people with epilepsy. Repeating it, adding sleep or sleep deprivation, and recording longer raise the yield to around 80–90%.","Roughly 0.5–1% of healthy adults have epileptiform discharges (more in relatives of people with epilepsy and after brain injury): the EEG supports the diagnosis, it does not make it.","After a first unprovoked seizure, epileptiform discharges raise the risk of recurrence and can support a diagnosis of epilepsy after a single seizure (ILAE: recurrence risk of at least 60%)."]},
 {trap:"Generalized discharges can look focal (fragments, asymmetry), and frontal discharges can spread to both sides fast. Look at the first milliseconds and the clinical story before choosing a narrow-spectrum drug, which can worsen generalized epilepsies."}
],
quiz:[
 {q:"A sharp transient is 50 ms long, rises steeply, has an after-going slow wave, disrupts the background and has a field. Best term?", o:["Spike (epileptiform)","Sharp wave","Wicket spike","Small sharp spike"], why:"Under 70 ms is a spike; the after-going slow wave, disruption and field make it epileptiform."},
 {q:"The commonest focal epilepsy in adults usually shows interictal discharges maximal at:", o:["F7/F8 and T7/T8 (anterior temporal)","O1/O2","C3/C4","Fp1/Fp2"], why:"Mesial temporal lobe epilepsy: anterior temporal sharp waves at F7/F8, T7/T8 and inferior temporal electrodes."},
 {q:"Which rhythmic delta pattern carries the same meaning as temporal spikes?", o:["TIRDA","FIRDA","OIRDA","Delta in N3 sleep"], why:"Temporal intermittent rhythmic delta is an epileptiform equivalent for temporal lobe epilepsy."},
 {q:"Irregular 4–6 Hz generalized polyspike-and-wave in a 19-year-old with morning jerks suggests:", o:["Juvenile myoclonic epilepsy","Childhood absence epilepsy","Lennox–Gastaut syndrome","Mesial temporal lobe epilepsy"], why:"JME: morning myoclonus, generalized tonic–clonic seizures, 4–6 Hz polyspike-and-wave, often photosensitive."},
 {q:"A patient with two clear unprovoked seizures has a normal routine EEG. What now?", o:["A normal EEG doesn't exclude epilepsy: consider a sleep-deprived or longer recording, and decide on clinical grounds","Epilepsy is excluded","Repeat only if seizures recur","The seizures must be nonepileptic"], why:"The yield of one routine EEG is limited; the diagnosis is clinical, and repeat or prolonged recordings raise the yield."},
 {q:"Slow spike-and-wave under 2.5 Hz in an adult with intellectual disability and tonic seizures in sleep suggests:", o:["Lennox–Gastaut syndrome","Juvenile myoclonic epilepsy","Absence epilepsy","Benign variant"], why:"Slow spike-and-wave and generalized paroxysmal fast activity are the hallmarks of Lennox–Gastaut syndrome, which continues into adulthood."}
]});

/* ================= Level 8 ================= */
L.push({id:"L8", title:"Seizures and status", sub:"Evolution, ACNS definitions, Salzburg criteria and lookalikes", mins:30,
goals:["Recognize a seizure by its evolution","Apply the ACNS definitions of seizure, status and the ictal–interictal continuum","Use the Salzburg criteria for nonconvulsive status","Tell epileptic seizures from functional seizures and syncope on EEG"],
blocks:[
 {h:"What makes it a seizure: evolution"},
 {p:"A seizure pattern changes over time in frequency, shape and location (spread), then ends, often followed by postictal slowing or suppression. A rhythmic pattern that never changes is often not a seizure."},
 {fig:"tlesz"},
 {h:"ACNS 2021 definitions"},
 {tbl:{head:["Term","Definition"], rows:[
  ["Electrographic seizure (ESz)","Epileptiform discharges averaging more than 2.5 Hz for at least 10 s (over 25 in 10 s), or any pattern with definite evolution lasting at least 10 s"],
  ["Electrographic status epilepticus (ESE)","An electrographic seizure for at least 10 continuous minutes, or adding up to at least 20% of any 60-minute period"],
  ["Electroclinical seizure (ECSz)","Any EEG pattern with a definite clinical correlate time-locked to it (any duration), or an EEG and clinical improvement with a parenteral anti-seizure medication"],
  ["Electroclinical status (ECSE)","An electroclinical seizure for at least 10 continuous minutes or 20% of an hour; at least 5 minutes if bilateral tonic–clonic"],
  ["Ictal–interictal continuum (IIC)","Periodic discharges or spike-and-wave over 1 and up to 2.5 Hz; or 0.5–1 Hz with a plus modifier or fluctuation; or lateralized rhythmic delta over 1 Hz with a plus modifier or fluctuation, without meeting seizure criteria"],
  ["BIRDs","Brief potentially ictal rhythmic discharges: over 4 Hz, at least 0.5 s and under 10 s"]]}},
 {h:"Salzburg criteria for nonconvulsive status"},
 {p:"For patients without a known epileptic encephalopathy, with the pattern lasting at least 10 seconds:"},
 {ul:["Epileptiform discharges faster than 2.5 Hz, <b>or</b>","Epileptiform discharges at 2.5 Hz or slower, or rhythmic delta/theta over 0.5 Hz, <b>plus one of</b>: EEG and clinical improvement after an IV anti-seizure drug; subtle clinical ictal signs during the pattern; typical spatial and temporal evolution.","If only the EEG improves (not the patient), or there is fluctuation without definite evolution: <b>possible</b> nonconvulsive status."]},
 {fig:"ncse"},
 {h:"Focal seizure patterns in adults"},
 {ul:["<b>Mesial temporal</b>: rhythmic 5–9 Hz theta over the anterior temporal region within about 30 seconds of onset, the best lateralizing scalp finding.","<b>Neocortical temporal</b>: slower, irregular, more widespread delta–theta onset, often less well lateralized.","<b>Frontal</b> (especially mesial and orbital): brief, often from sleep, hypermotor; the scalp EEG may show only muscle or a diffuse flattening, and a normal-looking scalp EEG during the event doesn't rule it out.","<b>Electrodecremental onset</b> (diffuse flattening with low-voltage fast activity) is common at the start of focal seizures and in tonic seizures.","<b>Postictal slowing</b> on one side helps to lateralize."]},
 {h:"Lookalikes"},
 {tbl:{head:["Event","EEG during it","Clues"], rows:[
  ["Functional (dissociative) seizure","Normal awake rhythms (alpha) between movement artifacts; no evolution; no postictal slowing","Eyes closed during the event, waxing and waning, side-to-side movements, long duration, pelvic thrusting, ictal crying, recall of the event"],
  ["Convulsive syncope","Slow, flat, slow, after bradycardia or asystole on the EKG","Trigger (standing, pain, fear); a few brief jerks; quick recovery"],
  ["Frontal hypermotor seizure","May be hidden by artifact or look normal","Brief, stereotyped, from sleep, in clusters; easily mistaken for functional events"]]}},
 {fig:"pnes"},
 {fig:"syncope"}
],
quiz:[
 {q:"Generalized periodic discharges at 2 Hz for 15 minutes, no clinical change, no evolution. ACNS category?", o:["Ictal–interictal continuum","Electrographic seizure","Electrographic status","Normal"], why:"Periodic discharges over 1 and up to 2.5 Hz without evolution fall on the ictal–interictal continuum."},
 {q:"Generalized 3 Hz spike-and-wave lasting 12 seconds is:", o:["An electrographic seizure","Interictal","On the ictal–interictal continuum","A benign variant"], why:"Epileptiform discharges averaging more than 2.5 Hz for at least 10 seconds meet the definition of an electrographic seizure."},
 {q:"Electrographic status epilepticus is an electrographic seizure lasting:", o:["At least 10 continuous minutes, or 20% of any 60-minute period","At least 5 minutes","At least 30 minutes","At least 1 minute"], why:"ACNS 2021: 10 continuous minutes or 20% of an hour. Convulsive (bilateral tonic–clonic) electroclinical status needs only 5 minutes."},
 {q:"The best scalp EEG finding that lateralizes a mesial temporal seizure is:", o:["Rhythmic 5–9 Hz theta over one anterior temporal region within about 30 seconds","Diffuse flattening","Muscle artifact","Generalized delta"], why:"Early rhythmic temporal theta (Risinger pattern) lateralizes and localizes mesial temporal onset well."},
 {q:"During a 12-minute thrashing event with eyes squeezed shut, alpha is visible between artifacts and the record is normal right afterwards. This strongly suggests:", o:["A functional (dissociative) seizure","A frontal lobe seizure","Convulsive syncope","Nonconvulsive status"], why:"Preserved alpha during apparent generalized shaking and no postictal slowing argue against an epileptic seizure; combine with semiology on video-EEG."},
 {q:"The EEG during convulsive syncope typically shows:", o:["Slow, flat, slow","Evolving rhythmic theta","3 Hz spike-and-wave","Normal alpha throughout"], why:"Cerebral hypoperfusion gives high-voltage delta, then suppression, then delta again as blood flow returns."}
]});

/* ================= Level 9 ================= */
L.push({id:"L9", title:"ICU EEG and coma", sub:"ACNS terms, periodic patterns, burst suppression and prognosis", mins:30,
goals:["Name any rhythmic or periodic pattern with the ACNS terms","Know which patterns carry seizure risk","Read triphasic waves with caution","Use EEG in post-arrest prognosis and know the rules for electrocerebral inactivity"],
blocks:[
 {h:"ACNS terminology in one table"},
 {tbl:{head:["Part","Options"], rows:[
  ["Main term 1: where","G generalized · L lateralized · BI bilateral independent · UI unilateral independent · Mf multifocal"],
  ["Main term 2: what","PD periodic discharges · RDA rhythmic delta activity · SW spike-and-wave or sharp-and-wave"],
  ["Plus modifiers","+F superimposed fast activity · +R superimposed rhythmic activity · +S superimposed sharp waves or spikes (+FR, +FS)"],
  ["Other modifiers","Prevalence (continuous 90% or more, abundant 50–89%, frequent 10–49%, occasional 1–9%, rare under 1%), duration, frequency, number of phases (triphasic), sharpness, amplitude, polarity, stimulus-induced (SI-), evolving, fluctuating or static"]]}},
 {p:"Example: <i>LPDs+F at 1.5 Hz, abundant, stimulus-induced</i>. That is the language of continuous EEG reports."},
 {h:"Patterns and what they mean"},
 {tbl:{head:["Pattern","Typical causes","Seizure association"], rows:[
  ["LPDs","Acute or subacute lesions: stroke, haemorrhage, tumour, herpes encephalitis, abscess","High at any rate; higher with faster rates (especially over 2 Hz), plus features and higher prevalence"],
  ["LRDA","Acute lesions","Raised, similar to LPDs"],
  ["GPDs","Anoxia, toxic-metabolic (liver, kidney, sepsis), drugs (cefepime, lithium, baclofen), CJD, after status","Raised, especially at higher frequency or with plus features"],
  ["BIPDs","Bilateral lesions, anoxia, CNS infection","High"],
  ["GRDA (FIRDA)","Encephalopathy","Not associated"],
  ["Burst suppression","Anaesthetic drugs, severe anoxia, hypothermia","Depends on cause"],
  ["Periodic sharp wave complexes","Sporadic CJD: 0.5–2 Hz, generalized or lateralized, weeks to months in","—"]]}},
 {fig:"lpd"},
 {fig:"lpdtemp"},
 {h:"Triphasic waves or nonconvulsive status?"},
 {ul:["Favouring a metabolic pattern: frontal maximum with an anterior–posterior lag, around 1.5–2 Hz, a slow background, no evolution, a known metabolic or drug cause.","Favouring seizures: over 2.5 Hz, evolution, spiky morphology, a clinical correlate.","A benzodiazepine trial can abolish both. Only clinical improvement points to status; EEG improvement alone means possible status at most. Non-sedating anti-seizure drugs make the trial safer in fragile patients."]},
 {fig:"gpdtri"},
 {h:"After cardiac arrest"},
 {ul:["<b>Highly malignant</b> (poor outcome likely, with other evidence): suppressed background (under 10 µV) with or without continuous periodic discharges; burst suppression, especially with identical bursts. Assessed more than 24 hours after arrest, off sedation.","<b>Malignant</b>: discontinuous background, low voltage (under 20 µV), reversed front-to-back gradient, abundant periodic discharges, unreactive background, unequivocal seizures.","<b>Favourable</b>: a continuous, normal-voltage, reactive background early on (within 12–24 hours).","Never decide on EEG alone: combine examination, SSEP N20, neuron-specific enolase and imaging, and exclude sedation and other confounders."]},
 {fig:"bs"},
 {fig:"anoxic"},
 {fig:"cjd"},
 {h:"Electrocerebral inactivity"},
 {p:"No cerebral activity over 2 µV at 2 µV/mm, with strict technique: a full electrode array, electrode distances of at least 10 cm, impedances between 100 and 10,000 Ω, at least 30 minutes, and reactivity testing with strong stimuli, with EKG and other monitors recorded. Sedatives, hypothermia and metabolic disturbance must be excluded. The 2023 US brain-death guideline (AAN, AAP, CNS, SCCM) accepts only blood-flow studies as ancillary tests, not EEG; some other countries still use EEG. Follow your local protocol."},
 {fig:"eci"},
 {h:"Delayed cerebral ischaemia after subarachnoid haemorrhage"},
 {p:"Continuous EEG with quantitative trends can warn of ischaemia before clinical signs: a falling alpha-to-delta ratio or alpha variability, new focal slowing, or new epileptiform activity."}
],
quiz:[
 {q:"Left hemispheric sharp waves repeating about once a second with superimposed fast activity are named:", o:["LPDs+F","GPDs","LRDA","BIRDs"], why:"Lateralized periodic discharges with the plus modifier F (superimposed fast activity)."},
 {q:"Which pattern is NOT associated with an increased risk of seizures?", o:["GRDA (FIRDA)","LPDs","LRDA","BIPDs"], why:"Generalized rhythmic delta activity is nonspecific; lateralized and periodic patterns carry seizure risk."},
 {q:"Day 3 after cardiac arrest, off sedation: burst suppression with identical bursts and myoclonus. Best interpretation?", o:["A highly malignant pattern; combine it with exam, SSEP, NSE and imaging","Diagnostic of brain death","A good prognostic sign","Lance–Adams syndrome"], why:"Identical bursts are highly malignant but must be part of a multimodal assessment, never used alone."},
 {q:"Triphasic GPDs in a cirrhotic patient vanish with IV lorazepam, but the patient doesn't wake up. This means:", o:["Not proof of NCSE: at most possible status","Definite NCSE","Hepatic encephalopathy is excluded","Brain death"], why:"Both triphasic waves and seizures can disappear with benzodiazepines; without clinical improvement the Salzburg criteria call it possible NCSE."},
 {q:"At what sensitivity is electrocerebral inactivity assessed?", o:["2 µV/mm","7 µV/mm","10 µV/mm","20 µV/mm"], why:"ACNS: record at 2 µV/mm for at least 30 minutes with a full array and reactivity testing."},
 {q:"A rapidly progressive dementia with startle myoclonus and generalized sharp complexes about once a second suggests:", o:["Sporadic Creutzfeldt–Jakob disease","Hepatic encephalopathy","Juvenile myoclonic epilepsy","Herpes simplex encephalitis"], why:"Periodic sharp wave complexes are typical of sporadic CJD; confirm with diffusion MRI and CSF RT-QuIC."}
]});

/* ================= Level 10: case trials (on the Cases tab) ================= */
L.push({id:"L10", title:"Hero trials", sub:"Adult cases: read the EEG, then decide", mins:60, cases:true,
goals:["Read an unmarked EEG with the 7-step routine","Turn the finding into a clinical decision","Ace at least 12 cases"], blocks:[], quiz:[]});

/* ================= Cases ================= */
const C = [
 {id:"c1", title:"Morning jerks", spec:"pspw",
  stem:"A 19-year-old university student has jerks of both arms in the morning (she has dropped her coffee twice) and had a generalized tonic–clonic seizure after an all-night study session. Routine EEG.",
  qs:[{q:"Main finding?", o:["Generalized 4–6 Hz polyspike-and-wave","Left temporal sharp waves","3 Hz spike-and-wave","Normal EEG"], why:"Irregular generalized polyspike-and-wave bursts with a myoclonic jerk."},
      {q:"Best first drug for her?", o:["Levetiracetam, avoiding valproate if she may become pregnant","Carbamazepine","Phenytoin","No treatment: the jerks are benign"], why:"Valproate is the most effective drug for juvenile myoclonic epilepsy but is avoided in women who may become pregnant. Carbamazepine, oxcarbazepine and phenytoin can worsen myoclonus and absences."}],
  teach:["Juvenile myoclonic epilepsy: onset in the teens, morning myoclonus, generalized tonic–clonic seizures triggered by sleep loss and alcohol, photosensitivity in about a third.","Treatment is usually lifelong; counsel about sleep, alcohol and driving.","Lamotrigine can occasionally worsen myoclonus."]},
 {id:"c2", title:"Déjà vu and lip smacking", spec:"tlesz",
  stem:"A 34-year-old man with febrile seizures in childhood has spells: a rising epigastric feeling and déjà vu, then he stares, smacks his lips and fumbles with his right hand while the left hand posture stiffens, for about a minute, followed by confusion. A spell is captured on video-EEG.",
  qs:[{q:"Where does the seizure start?", o:["Right temporal","Left temporal","Left frontal","Generalized"], why:"The onset and evolving rhythmic theta are maximal at F8/T8, and the postictal slowing is right-sided."},
      {q:"Which MRI finding is most likely?", o:["Right hippocampal sclerosis","Left frontal tumour","Normal MRI in all cases","Diffuse atrophy"], why:"Mesial temporal lobe epilepsy with hippocampal sclerosis: history of febrile seizures, epigastric aura, oral automatisms."}],
  teach:["Dystonic posturing is contralateral to the onset; hand automatisms are usually ipsilateral. Left hand posturing points to the right hemisphere.","Rhythmic 5–9 Hz temporal theta within 30 seconds of onset localizes mesial temporal seizures well.","If two appropriate drugs fail, refer early for epilepsy surgery evaluation."]},
 {id:"c3", title:"Not waking after a seizure", spec:"ncse",
  stem:"A 52-year-old man with epilepsy had a generalized convulsion at home and was given rectal diazepam. Ninety minutes later he is still drowsy, doesn't follow commands and has subtle eyelid twitching. EEG first page, then after treatment.",
  qs:[{q:"What does the first page show?", o:["Nonconvulsive status epilepticus","Postictal slowing only","Triphasic waves","Burst suppression"], why:"Continuous generalized sharp-and-slow waves faster than 2.5 Hz with subtle twitching: definite NCSE by the Salzburg criteria."},
      {q:"What should happen next?", o:["Treat as status: IV benzodiazepine, then a second-line IV drug, with continuous EEG","Observe; he is postictal","Wait for an MRI","Give flumazenil"], why:"Nonconvulsive status after convulsive status is still status and needs the same urgent treatment pathway."}],
  teach:["After convulsive status is stopped clinically, a substantial minority of patients (about one in seven in a landmark series) remain in nonconvulsive status.","Failure to wake within the expected time after a convulsion is an indication for urgent EEG.","Second-line options: levetiracetam, valproate or fosphenytoin (similar efficacy in the ESETT trial)."]},
 {id:"c4", title:"Cirrhosis and confusion", spec:"gpdtri",
  stem:"A 64-year-old man with cirrhosis is confused and has asterixis; ammonia is high. EEG.",
  qs:[{q:"Main finding?", o:["Generalized periodic discharges with triphasic morphology","Lateralized periodic discharges","3 Hz spike-and-wave","Normal sleep"], why:"Generalized complexes around 1.8 Hz, frontally predominant with an anterior–posterior lag, on a slow background."},
      {q:"Best next step?", o:["Treat the encephalopathy and keep watching; use a cautious anti-seizure trial if NCSE remains a concern","Intubate and start a midazolam infusion","Call it nonconvulsive status and load phenytoin","Ignore it: triphasic waves are always metabolic"], why:"No single feature separates triphasic waves from NCSE; the clinical response decides. Treat the cause (lactulose, rifaximin) and reassess."}],
  teach:["Also think of cefepime toxicity in renal failure, lithium, baclofen, ifosfamide and serotonin syndrome.","A benzodiazepine trial that clears the EEG without clinical improvement doesn't prove status.","Continuous EEG helps when the picture evolves."]},
 {id:"c5", title:"After the stroke", spec:"lpd",
  stem:"A 74-year-old woman, three days after a left MCA infarct, becomes less alert and has intermittent twitching of the right face. EEG.",
  qs:[{q:"Main finding?", o:["Left lateralized periodic discharges about once a second","Generalized slowing only","Left temporal intermittent rhythmic delta","Right-sided attenuation"], why:"Sharp waves repeating roughly once a second over the left hemisphere: LPDs."},
      {q:"If the facial twitches are time-locked to the discharges, the pattern is:", o:["An electroclinical seizure: treat with an anti-seizure drug","Interictal: no treatment","A benign variant","Artifact from the twitching"], why:"ACNS: any EEG pattern with a time-locked clinical correlate is an electroclinical seizure, whatever its frequency."}],
  teach:["LPDs mark acute hemispheric injury and carry a high seizure risk; watch for faster rates and plus features.","About 24 hours of continuous EEG catches most nonconvulsive seizures; comatose patients may need 48 hours.","Post-stroke seizures in the first week are acute symptomatic; later ones raise the risk of epilepsy."]},
 {id:"c6", title:"Fever and strange behaviour", spec:"lpdtemp",
  stem:"A 38-year-old man has three days of fever and headache, is now confused with word-finding difficulty, and complains of a smell of burning rubber. EEG.",
  qs:[{q:"Main finding?", o:["Left temporal periodic discharges","Generalized 3 Hz spike-and-wave","Normal EEG","Bilateral frontal rhythmic delta"], why:"Complex sharp waves every 1.5–2 seconds over the left temporal region."},
      {q:"What do you do now?", o:["Start IV acyclovir immediately, then MRI and CSF HSV PCR","Wait for the PCR before treating","Start steroids only","Repeat the EEG in a week"], why:"Herpes simplex encephalitis is treatable and devastating if delayed; treat on suspicion."}],
  teach:["Temporal periodic discharges with fever, confusion and an olfactory aura strongly suggest HSV encephalitis.","MRI shows asymmetric mesial temporal, insular and orbitofrontal involvement.","Consider autoimmune encephalitis (for example NMDA receptor) if HSV PCR is negative or symptoms relapse."]},
 {id:"c7", title:"Rapid decline", spec:"cjd",
  stem:"A 66-year-old woman has had three months of memory loss, unsteadiness and jerks when startled. EEG.",
  qs:[{q:"Main finding?", o:["Generalized periodic sharp wave complexes about once a second","Triphasic waves at 1.8 Hz","3 Hz spike-and-wave","Burst suppression"], why:"Biphasic sharp complexes repeating about once a second on a low, slow background, with a startle jerk."},
      {q:"Best confirmatory tests?", o:["Diffusion MRI and CSF RT-QuIC","Brain biopsy first","Serum ammonia only","Repeat EEG in a year"], why:"Cortical ribboning and caudate/putamen restricted diffusion on MRI and a positive CSF RT-QuIC strongly support sporadic CJD."}],
  teach:["Periodic sharp wave complexes appear in roughly two-thirds of sporadic CJD at some point, often mid-course, and can be missing early.","They are usually absent in variant CJD.","Serial EEGs raise the yield."]},
 {id:"c8", title:"Shaking with eyes shut", spec:"pnes",
  stem:"A 27-year-old woman has daily 5–15 minute episodes of thrashing with side-to-side head movement and eyes squeezed shut, crying afterwards. She takes three anti-seizure drugs without benefit. An event is captured on video-EEG.",
  qs:[{q:"What does the EEG show during the event?", o:["Movement artifact with preserved alpha and no postictal slowing","An evolving electrographic seizure","Generalized polyspike-and-wave","Diffuse suppression"], why:"Artifact only, with normal awake alpha in the pauses and immediately afterwards."},
      {q:"Best next step?", o:["Explain the diagnosis of functional seizures and refer for psychological therapy; review whether anti-seizure drugs are needed","Add a fourth anti-seizure drug","Start an anaesthetic infusion","Tell her nothing is wrong"], why:"A clear, respectful explanation and psychological treatment (such as CBT-based therapy) is the treatment; anti-seizure drugs don't help functional seizures."}],
  teach:["Around a quarter of people referred to epilepsy units for 'drug-resistant epilepsy' have functional seizures, and some have both.","Eyes closed during the event, a fluctuating course, long duration and side-to-side movements favour functional seizures.","Video-EEG capture of a typical event is the gold standard."]},
 {id:"c9", title:"Fainting and jerks", spec:"syncope",
  stem:"A 21-year-old medical student faints during blood draws, sometimes with a few jerks. A tilt-table test with EEG reproduces a spell.",
  qs:[{q:"What does the EEG show?", o:["Slow, flat, slow, after asystole on the EKG","An evolving seizure","Generalized spike-and-wave","Normal throughout"], why:"Cerebral hypoperfusion: delta, then suppression, then delta, following the heart's pause."},
      {q:"Best management?", o:["No anti-seizure drug: explain reflex syncope, counter-pressure manoeuvres and triggers","Start levetiracetam","Order an MRI and a sleep-deprived EEG and stop driving for a year","Start an anaesthetic infusion"], why:"Convulsive syncope is not epilepsy; jerks come from brainstem release, not cortex."}],
  teach:["Brief jerks are common in syncope and don't make it a seizure.","Quick recovery without prolonged confusion favours syncope.","Look at the EKG channel in every event."]},
 {id:"c10", title:"Is it epilepsy?", spec:"wicket",
  stem:"A 58-year-old man lost consciousness once while standing in a hot church. An outside EEG was reported as 'left temporal spikes' and he was started on carbamazepine. You re-read the EEG.",
  qs:[{q:"What are the 'spikes'?", o:["Wicket spikes, a benign variant","Left anterior temporal spikes","Small sharp spikes","Temporal intermittent rhythmic delta"], why:"Arch-shaped trains and single waves in drowsiness with no slow wave and no disruption of the background."},
      {q:"What now?", o:["Reconsider the diagnosis (likely syncope) and discuss stopping carbamazepine","Increase the carbamazepine","Add a second anti-seizure drug","Arrange epilepsy surgery assessment"], why:"Overreading benign variants is a leading cause of misdiagnosed epilepsy; treat the patient's story, not the EEG."}],
  teach:["Benign variants are most common in drowsiness: always check the state.","A single wicket is identified by comparing it with the trains.","A misdiagnosis of epilepsy carries driving, work and drug consequences."]},
 {id:"c11", title:"After the cardiac arrest", spec:"anoxic",
  stem:"A 59-year-old man had a ventricular fibrillation arrest with 25 minutes to return of circulation, and was treated with temperature control. On day 3, off sedation for 48 hours, he has myoclonus. EEG.",
  qs:[{q:"Main finding?", o:["Burst suppression with identical bursts and time-locked myoclonus","Continuous reactive background","Nonconvulsive status","Electrocerebral inactivity"], why:"Identical bursts repeating out of a flat background, each with a jerk."},
      {q:"How do you use it?", o:["As one highly malignant sign within a multimodal assessment (exam, SSEP N20, NSE, imaging)","As proof of brain death","As a reason for immediate withdrawal on its own","As a good prognostic sign"], why:"Prognosis after arrest is multimodal; no single test decides."}],
  teach:["Early myoclonus with a malignant EEG differs from Lance–Adams syndrome (action myoclonus in an awake patient, which can have a good outcome).","Assess more than 24 hours after arrest and off sedation.","A continuous reactive background in the first 24 hours is favourable."]},
 {id:"c12", title:"Drowsy after a fall", spec:"asym",
  stem:"An 81-year-old man on apixaban fell three weeks ago and is now drowsy with mild left-sided weakness. EEG.",
  qs:[{q:"Main finding?", o:["Lower amplitude of everything over the right hemisphere","Right temporal sharp waves","Breach rhythm on the right","Generalized slowing only"], why:"Alpha, beta and background are all attenuated on the right."},
      {q:"Next step?", o:["CT head: look for a right subdural haematoma","Start an anti-seizure drug","Repeat the EEG in a month","Lumbar puncture"], why:"One-sided attenuation means something between cortex and electrode, such as subdural blood."}],
  teach:["Attenuation can also come from scalp swelling or a large cortical infarct.","Higher amplitude on one side is usually a breach.","Chronic subdural haematoma is common in older adults on anticoagulants and can present weeks after minor trauma."]},
 {id:"c13", title:"Staring spells at 24", spec:"gsw3",
  stem:"A 24-year-old woman has had brief staring spells several times a day since her teens and recently had a generalized tonic–clonic seizure. She is not on treatment. EEG with hyperventilation.",
  qs:[{q:"Main finding?", o:["Generalized 3 Hz spike-and-wave with an absence seizure","Left temporal seizure","Polyspike-and-wave","FIRDA"], why:"Abrupt, symmetric 3 Hz spike-and-wave provoked by hyperventilation, with loss of counting."},
      {q:"Best drug choice?", o:["Lamotrigine or levetiracetam (valproate avoided if she may become pregnant)","Ethosuximide alone","Carbamazepine","Phenytoin"], why:"Ethosuximide treats absences but not generalized tonic–clonic seizures. Carbamazepine and phenytoin can worsen absences."}],
  teach:["Juvenile absence epilepsy often persists into adulthood and is commonly accompanied by generalized tonic–clonic seizures.","Ask patients to count during hyperventilation to test awareness.","Absences are a driving risk even when brief."]},
 {id:"c14", title:"Word-finding spells", spec:"ats",
  stem:"A 67-year-old woman has had three episodes of being unable to speak for one to two minutes, with lip smacking, followed by tiredness. MRI shows small vessel disease. EEG.",
  qs:[{q:"Main finding?", o:["Left anterior temporal sharp waves","Normal EEG","Wicket spikes","Left temporal polymorphic delta"], why:"Sharp waves with an after-going slow wave and a phase reversal at F7, disrupting the background."},
      {q:"Most likely diagnosis?", o:["Late-onset focal epilepsy (left temporal)","Transient ischaemic attacks","Transient global amnesia","Functional seizures"], why:"Stereotyped spells with automatisms and left temporal discharges point to focal seizures; TIAs give negative symptoms without automatisms."}],
  teach:["Vascular disease is the commonest cause of epilepsy starting after 60.","Lamotrigine and levetiracetam are well tolerated in older adults; lamotrigine did best for focal epilepsy in the SANAD II trial.","Late-onset epilepsy is also a warning sign for later stroke and cognitive decline."]},
 {id:"c15", title:"Headaches and personality change", spec:"focalslow",
  stem:"A 55-year-old man has two months of headaches and personality change; you find a mild right pronator drift. EEG.",
  qs:[{q:"Main finding?", o:["Continuous left temporal polymorphic delta","Left temporal sharp waves","FIRDA","Normal EEG"], why:"Continuous, irregular delta over the left temporal region with less alpha on the left."},
      {q:"Next step?", o:["MRI brain with contrast","Start an anti-seizure drug only","Repeat the EEG in 6 months","Reassure"], why:"Continuous focal polymorphic delta means a structural lesion until proven otherwise."}],
  teach:["Continuous focal slowing is more likely structural than intermittent slowing.","Tumours, abscesses, infarcts and haematomas all produce it.","Discharges near a lesion raise the risk of seizures."]},
 {id:"c16", title:"Missed dialysis", spec:"firda",
  stem:"A 70-year-old man with end-stage kidney disease missed two dialysis sessions and is now confused. EEG.",
  qs:[{q:"Main finding?", o:["Frontally predominant generalized rhythmic delta (FIRDA)","Nonconvulsive status","Frontal lobe seizures","Normal sleep"], why:"Monomorphic 2–3 Hz delta bursts, frontal and bilateral, on a slow background, without evolution."},
      {q:"Meaning?", o:["Nonspecific encephalopathy: treat the cause (dialysis)","Seizures: load an anti-seizure drug","A frontal tumour","Brain death"], why:"GRDA is nonspecific and not associated with seizures."}],
  teach:["If periodic discharges or triphasic waves appear, think of drug toxicity too (cefepime, gabapentin or baclofen accumulating in kidney failure).","FIRDA can also come from raised intracranial pressure or deep midline lesions."]},
 {id:"c17", title:"Titrating the coma", spec:"bs",
  stem:"A 45-year-old woman in refractory status epilepticus is on propofol and midazolam infusions; the team aims for burst suppression. EEG.",
  qs:[{q:"Is the target reached?", o:["Yes: bursts alternate with suppression under 10 µV","No: it is still a seizure","No: it is electrocerebral inactivity","No: it is a normal sleep record"], why:"Bursts of mixed activity separated by suppression for more than half the record."},
      {q:"Usual next step?", o:["Keep it for about 24–48 hours, then wean slowly under continuous EEG","Stop everything at once","Keep it for 2 weeks","Stop the EEG; the target is reached"], why:"Typical practice is 24–48 hours of seizure or burst suppression, then a slow wean while watching for recurrence."}],
  teach:["Search for the cause in parallel (autoimmune, infectious, metabolic, structural).","New-onset refractory status (NORSE) often has an autoimmune cause: consider early immunotherapy.","Continuous EEG is essential while weaning."]},
 {id:"c18", title:"The ancillary test", spec:"eci",
  stem:"A 33-year-old man with a massive intracerebral haemorrhage has no brainstem reflexes; apnoea testing isn't possible because of hypoxaemia. An EEG is done while the team arranges further testing.",
  qs:[{q:"Main finding?", o:["Electrocerebral inactivity, with only EKG and ventilator artifact","Low-voltage but present activity","Burst suppression","Alpha coma"], why:"Nothing cerebral above 2 µV at 2 µV/mm, unreactive to stimulation."},
      {q:"Which is required for a valid ECI recording?", o:["2 µV/mm, at least 30 minutes, full array, reactivity testing, no confounders","7 µV/mm for 10 minutes","Only frontal electrodes","Recording during propofol infusion is fine"], why:"ACNS technical standards; confounders such as sedatives and hypothermia must be excluded."}],
  teach:["The 2023 US brain-death guideline (AAN, AAP, CNS, SCCM) accepts only blood-flow studies as ancillary tests, not EEG; some other countries still use EEG. Follow your local protocol.","EEG reflects the cortex; it cannot test the brainstem.","Artifacts (EKG, ventilator) must be identified, not mistaken for brain activity."]},
 {id:"c19", title:"Normal EEG, still worried", spec:"pdr",
  stem:"A 30-year-old man has had two unprovoked generalized tonic–clonic seizures a month apart. An awake routine EEG is done.",
  qs:[{q:"What does it show?", o:["A normal, reactive 10 Hz posterior dominant rhythm","Generalized slowing","Generalized spike-and-wave","Left temporal sharp waves"], why:"A well-formed, reactive 10 Hz alpha with eye artifacts only."},
      {q:"What follows?", o:["Two unprovoked seizures make it epilepsy; treat, and consider a sleep-deprived or prolonged EEG to classify it","Epilepsy is excluded","No treatment until there is an abnormal EEG","Repeat the same awake EEG tomorrow"], why:"The diagnosis is clinical; repeated, sleep-deprived or longer recordings raise the yield and help choose the drug."}],
  teach:["A normal EEG doesn't rule out epilepsy.","Sleep deprivation and sleep raise the yield of interictal discharges.","Classifying focal versus generalized epilepsy guides the drug choice."]}
];

/* ================= Cheat sheet ================= */
const CHEAT = [
 {h:"Numbers to know", tbl:{head:["Item","Value"], rows:[
  ["Adult PDR","8.5–11 Hz; under 8 Hz alert = slowing"],["Sensitivity","7 µV/mm (2 µV/mm for ECI)"],["Timebase","30 mm/s, 10-second page"],["Filters","Low 1 Hz · High 70 Hz · Notch 60 (or 50) Hz"],
  ["Spike","20 to under 70 ms"],["Sharp wave","70–200 ms"],["Spindles","11–16 Hz (usually 12–14), at least 0.5 s, central"],["N3","Delta 0.5–2 Hz, over 75 µV, at least 20% of the epoch"],
  ["Low voltage","Under 20 µV"],["Suppression","Under 10 µV"],["Burst suppression","Suppression filling 50–99% of the record"],
  ["Electrographic seizure","Discharges over 2.5 Hz for 10 s or more, or definite evolution for 10 s or more"],["Electrographic status","10 continuous minutes, or 20% of any hour"],
  ["Ictal–interictal continuum","PDs/SW over 1 to 2.5 Hz; 0.5–1 Hz with plus or fluctuation; LRDA over 1 Hz with plus or fluctuation"],["BIRDs","Over 4 Hz, 0.5 to under 10 s"],
  ["Hyperventilation","3–5 minutes"],["Photic","1–30 Hz flashes (IFCN protocol up to 60 Hz)"]]}},
 {h:"Rules of thumb", ul:[
  "Negative is up. Pens pointing toward each other = negative phase reversal.",
  "Blink = Bell = positive at Fp1/Fp2. The eyes look toward the positive side (F7 or F8).",
  "No field = not brain.",
  "Evolution = seizure. Monomorphic and never-changing = probably not.",
  "State first: what is normal asleep is abnormal awake.",
  "When in doubt, don't call it epileptiform.",
  "FOLD is fine; WHAM worries.",
  "Continuous polymorphic delta = structural lesion.",
  "Look at the EKG channel and the video before you call anything rhythmic."]},
 {h:"The overcall list (normal or benign)", ul:["Wicket spikes","Small sharp spikes","6 Hz spike-and-wave (FOLD)","14 and 6 Hz positive spikes","RMTD (psychomotor variant)","SREDA","Midline theta","Breach rhythm","Vertex waves, POSTS, K-complexes, hypnagogic hypersynchrony","Mu, lambda, slow alpha variant","Eye movements, muscle, EKG, electrode pops"]},
 {h:"Writing the report", ol:[
  "<b>Clinical</b>: age, indication, medications, state, technical notes.",
  "<b>Description</b>: background (PDR frequency, reactivity, symmetry), sleep, abnormalities (location, morphology, frequency, prevalence), activation, artifacts.",
  "<b>Impression</b>: Normal, or Abnormal because of 1, 2, 3 (most important first).",
  "<b>Clinical correlation</b>: what it means for this patient, in plain words. Example: 'Left anterior temporal sharp waves indicate a potentially epileptogenic area in the left temporal region, in keeping with the history of focal seizures.' Avoid 'rule out epilepsy' and 'no evidence of epilepsy': the EEG can do neither."]}
];

window.EEGDATA = {RANKS, PLAN, LEVELS: L, CASES: C, CHEAT};
})();
