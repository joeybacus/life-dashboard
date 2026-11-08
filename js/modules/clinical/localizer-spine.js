/* Neuro Localizer: spinal cord levels. Axial cord sections as on MRI: anterior (ventral) at the top,
   patient's right on the viewer's left. Shapes are generated from normalized coordinates
   (u: -1 lateral … 0 midline, v: -1 anterior … +1 posterior) so each level keeps the same layout at its own size.
   Appended to window.LOC_SLICES; cord syndromes for the reference tab go to window.LOC_REF_CORD. */
(function () {
const S = window.LOC_SLICES = window.LOC_SLICES || [];
const CX = 300, CY = 210;

function level(o) {
  const W = o.W, H = o.H, vhw = o.vhw;
  const X = u => CX + u * W, Y = v => CY + v * H;
  const r1 = n => +n.toFixed(1);
  const ell = (u, v, ru, rv) => ["e", r1(X(u)), r1(Y(v)), r1(ru * W), r1(rv * H)];
  const seg = (a, b, half) => { // ellipse along the segment a→b
    const x1 = X(a[0]), y1 = Y(a[1]), x2 = X(b[0]), y2 = Y(b[1]);
    const len = Math.hypot(x2 - x1, y2 - y1) / 2, ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    return ["e", r1((x1 + x2) / 2), r1((y1 + y2) / 2), r1(half), r1(len), r1(ang - 90)];
  };
  const poly = pts => ["p", "M" + pts.map(([u, v]) => `${r1(X(u))},${r1(Y(v))}`).join(" L") + " Z"];
  const st = [];
  const add = (id, n, a, k, sh, fn, d, extra) => st.push(Object.assign({id, n, a, k, sh, fn, d}, extra || {}));

  add("lf", "White matter (lateral and anterior funiculi)", "WM", "wm", ["r", 0, 0, 300, 420], "Ascending and descending tracts (see the specific tracts listed)", [], {clip:"out"});
  add("vh", "Ventral horn", "VH", "nuc", seg([-0.08, -0.04], [-0.40, -0.52], vhw * W), "Lower motor neurons", [o.vhDef]);
  if (o.lmc) add("vhl", o.lmc[0], "LMC", "nuc", seg([-0.22, -0.26], [-0.42, -0.52], vhw * W * 0.8), o.lmc[1], [o.lmc[2]]);
  add("vhm", o.mmc ? o.mmc[0] : "Ventral horn, medial motor column (axial muscles)", "MMC", "nuc", seg([-0.10, -0.12], [-0.20, -0.42], vhw * W * 0.55), o.mmc ? o.mmc[1] : "Neck, back and trunk muscles", [o.mmc ? o.mmc[2] : ["{I} weakness of segmental axial muscles", "ipsi"]]);
  add("dh", "Dorsal horn (substantia gelatinosa, nucleus proprius)", "DH", "nuc", seg([-0.08, 0.06], [-0.46, 0.80], 0.06 * W), "First synapse for pain and temperature; reflex circuits", [o.dhDef || ["{I} band of pain and temperature loss at the level of the lesion", "ipsi"]]);
  add("dree", "Dorsal root entry zone and Lissauer tract", "DREZ", "tract", ell(-0.48, 0.84, 0.05, 0.07), "Incoming sensory root fibers", [["{I} radicular pain, segmental sensory loss and a lost reflex at this level", "ipsi"]]);
  add("vroot", "Ventral root (exiting motor fibers)", "VR", "tract", seg([-0.42, -0.54], [-0.62, -0.84], 4), "Motor axons leaving the cord", [["{I} lower motor neuron weakness in this myotome", "ipsi"]]);
  (o.extra || []).forEach(e => add(e.id, e.n, e.a, e.k || "nuc", ell(e.u, e.v, e.ru, e.rv), e.fn, e.d));
  add("gr", "Fasciculus gracilis (leg and lower trunk)", "Gr", "tract", ell(-0.08, 0.60, 0.06, o.cu ? 0.30 : 0.34), "Vibration and position sense from the leg", [["{I} loss of vibration and position sense in the leg; sensory ataxia, Romberg positive", "ipsi"]]);
  if (o.cu) add("cu", "Fasciculus cuneatus (arm and upper trunk)", "Cu", "tract", ell(-0.20, 0.56, 0.08, o.cuSmall ? 0.14 : 0.26), "Vibration and position sense from the arm", [["{I} loss of vibration and position sense in the arm; pseudoathetosis", "ipsi"]]);
  add("lcst", "Lateral corticospinal tract", "LCST", "tract", ell(-0.62, 0.30, 0.13, 0.20), "Crossed corticospinal fibers (arm fibers medial, leg and sacral lateral)", [["{I} upper motor neuron weakness below the lesion: spasticity, brisk reflexes, Babinski sign", "ipsi"]]);
  add("rst", "Rubrospinal tract", "RuST", "tract", ell(-0.55, 0.02, 0.06, 0.07), "Flexor tone (small in humans)", [["Usually little deficit alone", "bi"]]);
  if (o.symp) add("symp", "Descending sympathetic (hypothalamospinal) fibers", "Sym", "tract", ell(-0.46, 0.10, 0.03, 0.04), "To the intermediolateral column T1–L2", [o.symp]);
  add("stt", "Lateral spinothalamic tract", "STT", "tract", ell(-0.70, -0.26, 0.12, 0.18), "Pain and temperature (sacral fibers outermost)", [["{C} loss of pain and temperature starting 1–2 segments below the lesion; sacral sparing if the lesion is central", "contra"]]);
  if (o.dsct) add("dsct", "Dorsal spinocerebellar tract", "DSCT", "tract", ell(-0.88, 0.22, 0.06, 0.18), "Leg proprioception to the cerebellum (from Clarke's nucleus)", [["{I} leg ataxia", "ipsi"]]);
  add("vsct", "Ventral spinocerebellar tract", "VSCT", "tract", ell(-0.88, -0.22, 0.06, 0.16), "Spinal interneuron activity to the cerebellum", [["Mild {I} ataxia", "ipsi"]]);
  add("vest", "Vestibulospinal and reticulospinal tracts (anterior funiculus)", "VeST", "tract", ell(-0.30, -0.72, 0.12, 0.12), "Posture and antigravity tone", [["Poor postural control; contributes to spasticity patterns", "bi"]]);
  add("acst", "Anterior corticospinal tract", "ACST", "tract", ell(-0.07, -0.70, 0.05, 0.16), "Uncrossed corticospinal fibers to axial muscles", [["Mild axial weakness", "bi"]]);
  add("cgrey", "Central grey (grey commissure)", "CG", "nuc", ell(0, 0, 0.09, 0.08), "Visceral and crossing interneurons", [["Segmental autonomic and pain changes", "bi"]], {s:"M"});
  add("awc", "Anterior white commissure (crossing pain and temperature fibers)", "AWC", "tract", ell(0, -0.16, 0.10, 0.04), "Spinothalamic fibers crossing", [["Bilateral cape-like (suspended) loss of pain and temperature at the level of the lesion, touch preserved", "bi"]], {s:"M"});
  add("cc", "Central canal", "CC", "csf", ["c", CX, CY, 3], "", [], {s:"M"});
  add("amf", "Anterior median fissure", "AMF", "csf", ["p", `M${CX - 6},${r1(CY - H)} L${CX},${r1(CY - 0.80 * H)} L${CX + 6},${r1(CY - H)} Z`], "", [], {s:"M"});

  const terr = [
    {id:"vaso", n:o.art.vaso, f:"VA", sh:["r", 0, 0, 300, 420], clip:"out"},
    {id:"psa", n:o.art.psa, f:"PSA", sh:poly([[0, 0.10], [-0.16, 0.08], [-0.40, 0.30], [-0.62, 0.70], [-0.46, 1.04], [0, 1.04]])},
    {id:"asa", n:o.art.asa, f:o.art.asaF || "ASA", sh:poly([[0, -1.04], [-0.32, -0.98], [-0.70, -0.68], [-0.80, -0.10], [-0.62, 0.34], [-0.40, 0.30], [-0.16, 0.08], [0, 0.10]])}
  ];
  S.push({
    id:o.id, group:"Spinal cord", name:o.name, w:600, h:420,
    view:"Axial cord section, as on MRI: anterior at the top, patient’s right on the left · " + o.view,
    outline:`M${CX},${CY - H} C${r1(CX + 0.55 * W)},${CY - H} ${CX + W},${r1(CY - 0.55 * H)} ${CX + W},${CY} C${CX + W},${r1(CY + 0.55 * H)} ${r1(CX + 0.55 * W)},${CY + H} ${CX},${CY + H} C${r1(CX - 0.55 * W)},${CY + H} ${CX - W},${r1(CY + 0.55 * H)} ${CX - W},${CY} C${CX - W},${r1(CY - 0.55 * H)} ${r1(CX - 0.55 * W)},${CY - H} ${CX},${CY - H} Z`,
    structs:st, terr, syn:o.syn, note:o.note,
    presets:[
      {n:"Right hemisection (Brown-Séquard)", sh:[["p", `M${CX - 2},${CY - H - 4} L${CX - W - 6},${CY - H - 4} L${CX - W - 6},${CY + H + 4} L${CX - 2},${CY + H + 4} Z`]]},
      {n:"Anterior two-thirds (anterior spinal artery)", sh:[poly([[0.62, 0.30], [0.80, -0.10], [0.70, -0.70], [0.32, -1.0], [-0.32, -1.0], [-0.70, -0.70], [-0.80, -0.10], [-0.62, 0.30], [-0.30, 0.14], [0.30, 0.14]])[1]].map(d => ["p", d])},
      {n:"Dorsal columns (posterior cord)", sh:[poly([[-0.30, 0.34], [0.30, 0.34], [0.30, 0.95], [-0.30, 0.95]])[1]].map(d => ["p", d])},
      {n:"Central cord", sh:[ell(0, -0.06, 0.30, 0.24)]}
    ].concat(o.presets || [])
  });
}

const commonSyn = [
  {n:"Brown-Séquard (hemicord) syndrome", need:[["lcst"],["gr","cu"],["stt"]], t:"Same-side weakness and loss of vibration and position below the lesion, opposite pain and temperature loss from 1–2 segments below, and a same-side band of segmental loss at the level. Penetrating trauma, disc, tumor, MS."},
  {n:"Anterior spinal artery syndrome", bi:[["lcst"],["stt"]], not:["gr","cu"], t:"Paraplegia or quadriplegia and bilateral pain and temperature loss below the level, with vibration and position sense spared; bladder involved. Aortic surgery or dissection, hypotension, atherosclerosis, fibrocartilaginous embolism."},
  {n:"Posterior cord syndrome", bi:[["gr","cu"]], not:["lcst","stt"], t:"Loss of vibration and position sense with sensory ataxia and a positive Romberg; strength and pain sense preserved. Posterior spinal artery infarct, B12 or copper deficiency, tabes."},
  {n:"Syringomyelia pattern", bi:[["awc"]], not:["lcst","gr","cu","stt"], t:"Suspended, cape-like loss of pain and temperature at the level of the lesion with touch preserved; later anterior horn atrophy. Chiari-associated syrinx, post-traumatic or tumor cyst."},
  {n:"Central cord syndrome", bi:[["awc","cgrey"],["vh","vhl","vhm"]], not:["acst","vest"], t:"Weakness worse in the arms (especially hands) than the legs, variable sensory loss below and urinary retention; hyperextension injury in a stenotic cervical canal, syrinx, intramedullary tumor."},
  {n:"Subacute combined degeneration pattern", bi:[["gr","cu"],["lcst"]], not:["stt"], t:"Dorsal columns plus lateral corticospinal tracts on both sides: sensory ataxia, spastic weakness, Babinski signs, often with absent ankle reflexes from neuropathy. Vitamin B12, copper or nitrous oxide toxicity."},
  {n:"Tabes dorsalis pattern", bi:[["gr","cu"],["dree"]], not:["lcst","stt"], t:"Dorsal roots and dorsal columns: lightning pains, sensory ataxia, areflexia, Argyll Robertson pupils. Neurosyphilis."},
  {n:"Anterior horn (lower motor neuron) syndrome", need:[["vh","vhl","vhm","vroot"]], not:["lcst","stt","gr","cu"], t:"Flaccid weakness, atrophy, fasciculations and areflexia in the affected myotomes with normal sensation. Poliomyelitis, West Nile virus, spinal muscular atrophy, early ALS."},
  {n:"Combined upper and lower motor neuron pattern (ALS)", bi:[["vh","vhl","vhm"],["lcst"]], not:["stt","gr","cu"], t:"Anterior horn and lateral corticospinal tracts: wasting and fasciculations with spasticity and brisk reflexes, no sensory loss."},
  {n:"Complete cord transection", bi:[["lcst"],["stt"],["gr"]], t:"Loss of all motor and sensory function below the level with a sensory level; spinal shock (flaccid, areflexic) at first, spastic later; bladder and bowel loss; autonomic dysreflexia if above T6."}
];

level({
  id:"sc-c2", name:"Upper cervical cord (C2–C4)", W:205, H:136, vhw:0.11, cu:true, dsct:true,
  view:"high cervical, phrenic and spinal accessory nuclei",
  vhDef:["{I} weakness of neck muscles; diaphragm weakness if C3–C5 is involved", "ipsi"],
  lmc:["Ventral horn, lateral: spinal accessory nucleus (C1–C5)", "Sternocleidomastoid and trapezius", ["{I} weak shoulder shrug and head turning", "ipsi"]],
  mmc:["Ventral horn, medial: phrenic nucleus (C3–C5)", "Diaphragm", ["{I} hemidiaphragm paralysis; both sides: ventilator dependence", "ipsi"]],
  dhDef:["{I} facial numbness in an onion-skin pattern (caudal spinal trigeminal nucleus reaches C2) and occipital or neck pain", "ipsi"],
  symp:["{I} Horner syndrome with ipsilateral body anhidrosis (central)", "ipsi"],
  art:{vaso:"Pial vasocorona; radicular feeders from the vertebral, ascending and deep cervical arteries", psa:"Posterior spinal arteries (from the vertebral arteries or PICA): dorsal columns and dorsal horns", asa:"Anterior spinal artery (formed from both vertebral arteries): sulcocommissural branches to the anterior two-thirds"},
  note:"High cervical lesions above C4 threaten breathing (phrenic nucleus C3–C5); weakness below is upper motor neuron in all four limbs. Pain and temperature loss starts 1–2 segments below the lesion.",
  syn:commonSyn.concat([
    {n:"Phrenic nucleus (respiratory) involvement", bi:[["vhm"]], t:"Bilateral diaphragm paralysis: ventilatory failure. Unilateral: an elevated hemidiaphragm."},
    {n:"Central Horner syndrome (cervical cord)", need:[["symp"]], t:"Same-side ptosis and miosis with anhidrosis of the body half."},
    {n:"Foramen magnum / high cervical pattern", need:[["dh"],["lcst"],["gr","cu"]], t:"Facial (onion-skin) numbness with neck pain and same-side weakness; foramen magnum meningioma, Chiari, craniocervical instability."}
  ])
});

level({
  id:"sc-c6", name:"Cervical enlargement (C6)", W:205, H:122, vhw:0.17, cu:true, dsct:true,
  view:"cervical enlargement, arm motor neurons",
  vhDef:["{I} lower motor neuron weakness of arm muscles at C6", "ipsi"],
  lmc:["Ventral horn, lateral motor column (arm: biceps, brachioradialis, wrist extensors)", "Arm and forearm muscles", ["{I} weak elbow flexion and wrist extension, lost biceps and brachioradialis reflexes (C5–C6)", "ipsi"]],
  symp:["{I} Horner syndrome (central)", "ipsi"],
  art:{vaso:"Pial vasocorona; radiculomedullary feeders from the vertebral and ascending cervical arteries (often C5–C6)", psa:"Posterior spinal arteries: dorsal columns and dorsal horns", asa:"Anterior spinal artery, sulcocommissural branches: ventral horns, corticospinal and spinothalamic tracts"},
  note:"At a cervical level, lower motor neuron signs appear in the arm at that segment and upper motor neuron signs below. An inverted biceps reflex suggests a C5–C6 lesion.",
  syn:commonSyn.concat([{n:"Central Horner syndrome (cervical cord)", need:[["symp"]], t:"Same-side ptosis and miosis with anhidrosis of the body half."}])
});

level({
  id:"sc-t6", name:"Thoracic cord (T6)", W:140, H:116, vhw:0.07, cu:true, cuSmall:true, dsct:true,
  view:"mid-thoracic, intermediolateral column and Clarke's nucleus",
  vhDef:["{I} weakness of segmental intercostal and abdominal muscles (hard to detect)", "ipsi"],
  extra:[
    {id:"iml", n:"Intermediolateral column (sympathetic preganglionic neurons, T1–L2)", a:"IML", u:-0.26, v:-0.02, ru:0.07, rv:0.06, fn:"Sympathetic outflow to viscera and vessels", d:[["Autonomic dysfunction below the level; bilateral lesions above T6 risk autonomic dysreflexia", "bi"]]},
    {id:"clarke", n:"Clarke's nucleus (dorsal nucleus, C8–L2)", a:"Clk", u:-0.14, v:0.20, ru:0.06, rv:0.07, fn:"Origin of the dorsal spinocerebellar tract", d:[["{I} leg ataxia", "ipsi"]]}
  ],
  symp:["Loss of sympathetic tone below the lesion", "ipsi"],
  art:{vaso:"Pial vasocorona; few thoracic radiculomedullary feeders (intercostal arteries)", psa:"Posterior spinal arteries: dorsal columns and dorsal horns", asa:"Anterior spinal artery in the mid-thoracic watershed (T4–T8): thin, with few feeders, vulnerable to hypotension", asaF:"ASA"},
  note:"T6 dermatome is around the xiphoid. The mid-thoracic cord (T4–T8) is an arterial watershed, so anterior spinal artery infarcts after aortic surgery or hypotension cluster here.",
  syn:commonSyn
});

level({
  id:"sc-l4", name:"Lumbar enlargement (L4)", W:172, H:146, vhw:0.18, cu:false, dsct:false,
  view:"lumbar enlargement, leg motor neurons",
  vhDef:["{I} lower motor neuron weakness of leg muscles at L4", "ipsi"],
  lmc:["Ventral horn, lateral motor column (quadriceps, hip adductors, tibialis anterior)", "Knee extension, hip adduction, ankle dorsiflexion", ["{I} weak knee extension and ankle dorsiflexion, lost knee jerk (L3–L4)", "ipsi"]],
  art:{vaso:"Pial vasocorona", psa:"Posterior spinal arteries: dorsal columns and dorsal horns", asa:"Anterior spinal artery fed by the artery of Adamkiewicz (great anterior radiculomedullary artery, usually left-sided, T9–L2)"},
  note:"Occlusion of the artery of Adamkiewicz (aortic aneurysm repair, dissection) infarcts the lumbar enlargement and conus: flaccid paraplegia, a low sensory level and bladder failure.",
  syn:commonSyn
});

level({
  id:"sc-s3", name:"Sacral cord and conus (S3)", W:118, H:108, vhw:0.14, cu:false, dsct:false,
  view:"conus medullaris, sacral motor and parasympathetic nuclei",
  vhDef:["{I} weakness of pelvic floor and intrinsic foot muscles", "ipsi"],
  mmc:["Onuf nucleus (S2–S4: external urethral and anal sphincters)", "Voluntary continence", ["Sphincter weakness: urinary and fecal incontinence, lost anal and bulbocavernosus reflexes", "bi"]],
  dhDef:["Saddle (perianal) sensory loss on the {I} side", "ipsi"],
  extra:[
    {id:"spn", n:"Sacral parasympathetic nucleus (S2–S4)", a:"SPN", u:-0.24, v:-0.04, ru:0.08, rv:0.08, fn:"Detrusor contraction, erection", d:[["Urinary retention with overflow, erectile dysfunction", "bi"]]}
  ],
  art:{vaso:"Pial vasocorona; lateral sacral and iliolumbar radicular feeders", psa:"Posterior spinal arteries via the conus anastomotic loop", asa:"Anterior spinal artery and the conus anastomotic loop (cruciate anastomosis with the posterior spinal arteries)"},
  note:"A conus lesion gives early, symmetric bladder, bowel and sexual dysfunction with saddle anesthesia and little pain. A cauda equina lesion (roots below L1–L2) is asymmetric, painful and radicular, with later sphincter problems.",
  syn:commonSyn.concat([
    {n:"Conus medullaris syndrome", bi:[["vhm","spn"]], t:"Early urinary retention and incontinence, saddle anesthesia, lost anal and bulbocavernosus reflexes, erectile dysfunction; often mixed upper and lower motor neuron leg signs. Disc, tumor, trauma, vascular."}
  ])
});

window.LOC_REF_CORD = [
  ["Brown-Séquard (hemicord)", "One half of the cord", "Same-side UMN weakness and proprioceptive loss below; opposite pain and temperature loss from 1–2 segments below; same-side segmental loss at the level", "Penetrating trauma, disc, tumor, MS", "Mixed", "sc-c6"],
  ["Anterior spinal artery", "Anterior two-thirds, both sides", "Paraplegia or quadriplegia, bilateral pain and temperature loss, bladder failure; proprioception spared", "Aortic surgery or dissection, hypotension, embolism", "Anterior spinal artery (T4–T8 watershed; artery of Adamkiewicz)", "sc-t6"],
  ["Posterior cord", "Dorsal columns", "Sensory ataxia, Romberg positive, loss of vibration and position", "B12 or copper deficiency, tabes, posterior spinal artery infarct", "Posterior spinal arteries", "sc-t6"],
  ["Central cord", "Central grey and the inner corticospinal fibers", "Arms (hands) weaker than legs, variable sensory loss, urinary retention", "Hyperextension injury with cervical stenosis, syrinx, tumor", "Sulcocommissural branches", "sc-c6"],
  ["Syringomyelia", "Anterior white commissure, then horns", "Cape-like suspended loss of pain and temperature with touch preserved; later wasting of the hands", "Chiari I, trauma, tumor", "None (cyst)", "sc-c6"],
  ["Subacute combined degeneration", "Dorsal columns + lateral corticospinal tracts", "Sensory ataxia, spastic weakness, Babinski, often neuropathy", "B12, copper, nitrous oxide", "None (metabolic)", "sc-t6"],
  ["Tabes dorsalis", "Dorsal roots and columns", "Lightning pains, sensory ataxia, areflexia, Argyll Robertson pupils", "Neurosyphilis", "None (infectious)", "sc-l4"],
  ["Anterior horn", "Ventral horns", "LMN weakness, wasting, fasciculations; sensation normal", "Polio, West Nile, spinal muscular atrophy", "Anterior spinal artery territory", "sc-l4"],
  ["Amyotrophic lateral sclerosis pattern", "Ventral horns + lateral corticospinal tracts", "Combined UMN and LMN signs, no sensory loss", "ALS", "None (degenerative)", "sc-c6"],
  ["Complete transection", "Whole cord", "All function lost below a sensory level; spinal shock then spasticity; autonomic dysreflexia above T6", "Trauma, transverse myelitis, compression", "Any", "sc-t6"],
  ["Upper cervical / foramen magnum", "C1–C4 cord with caudal trigeminal nucleus", "Neck pain, onion-skin facial numbness, quadriparesis, diaphragm weakness", "Foramen magnum meningioma, Chiari, atlantoaxial instability", "Vertebral / anterior spinal artery", "sc-c2"],
  ["Conus medullaris", "S2–S5 cord", "Early symmetric bladder and bowel loss, saddle anesthesia, lost anal reflex", "Disc, tumor, trauma, vascular", "Conus anastomotic loop; artery of Adamkiewicz", "sc-s3"],
  ["Cauda equina (roots, not cord)", "Lumbosacral roots below L1–L2", "Asymmetric radicular pain and LMN weakness, saddle anesthesia, later sphincter loss", "Central disc herniation, tumor, stenosis", "Radicular arteries", "sc-s3"]
];
})();
