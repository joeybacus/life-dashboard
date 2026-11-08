/* Neuro Localizer: detailed brainstem levels (nine axial levels, MRI orientation: ventral at the top,
   patient's right on the viewer's left). Same conventions as localizer-slices.js; appended to window.LOC_SLICES.
   Arterial territories follow the four classic groups at every level (anteromedial, anterolateral,
   lateral, posterior), each named with its specific branches. */
(function () {
const D = {
  wkFAL: ["{C} face, arm and leg weakness (upper motor neuron)", "contra"],
  wkAL: ["{C} arm and leg weakness (upper motor neuron)", "contra"],
  wkALnoFace: ["{C} arm and leg weakness, face spared", "contra"],
  face: ["{C} lower face and tongue weakness", "contra"],
  dys: ["Dysarthria", "bi"],
  ml: ["{C} loss of vibration and position sense", "contra"],
  stt: ["{C} loss of pain and temperature in the arm, trunk and leg", "contra"],
  vtt: ["{C} loss of pain and temperature in the face", "contra"],
  mlf: ["{I} internuclear ophthalmoplegia (weak adduction of the {I} eye)", "ipsi"],
  horner: ["{I} Horner syndrome (ptosis, miosis, facial anhidrosis)", "ipsi"],
  ctt: ["Delayed palatal tremor (hypertrophic olivary degeneration)", "bi"],
  ataxI: ["{I} limb ataxia", "ipsi"],
  ataxC: ["{C} limb ataxia", "contra"],
  coma: ["Reduced consciousness (the arousal system is involved on both sides)", "bi", "BOTH"],
  pprf: ["Horizontal saccades toward the {I} side lost or slowed", "ipsi"],
  spv: ["{I} loss of pain and temperature in the face", "ipsi"],
  vest: ["Vertigo, nausea, nystagmus; falls toward the {I} side", "ipsi"]
};
const S = window.LOC_SLICES = window.LOC_SLICES || [];
const half = ["r",0,0,300,460];
const teg = (n, fn) => ({id:"teg", n, a:"RF", k:"wm", sh:half, clip:"out", fn, d:[D.coma]});
const v = s => ({group:"Brainstem", ...s});

/* ===== Midbrain ===== */
const MBO = "M300,122 L322,110 C350,94 392,70 432,74 C472,80 482,122 472,162 C464,202 472,244 456,292 C440,350 380,392 300,394 C220,392 160,350 144,292 C128,244 136,202 128,162 C118,122 128,80 168,74 C208,70 250,94 278,110 Z";
const CRUS = "M278,112 C250,96 210,72 168,76 C134,82 130,122 138,162 C176,152 230,142 272,136 Z";
const crus = [
  {id:"crus", n:"Cerebral peduncle (crus cerebri)", a:"CP", k:"tract", sh:["p",CRUS], fn:"Descending corticofugal fibers", d:[D.wkFAL]},
  {id:"fp", n:"Frontopontine fibers (medial fifth of the crus)", a:"FP", k:"tract", sh:["r",252,60,48,100], in:"crus", fn:"Frontal cortex to pontine nuclei", d:[["Little deficit alone; may add {C} ataxia","contra"]]},
  {id:"cbt", n:"Corticobulbar fibers", a:"CBT", k:"tract", sh:["r",230,60,22,100], in:"crus", fn:"Motor cortex to cranial motor nuclei", d:[D.face,D.dys]},
  {id:"cst", n:"Corticospinal fibers (middle three-fifths of the crus)", a:"CST", k:"tract", sh:["r",166,60,64,110], in:"crus", fn:"Arm fibers medial, leg fibers lateral", d:[D.wkAL]},
  {id:"ptop", n:"Parieto-temporo-occipitopontine fibers (lateral fifth)", a:"PTOP", k:"tract", sh:["r",100,60,66,120], in:"crus", fn:"Posterior cortex to pontine nuclei", d:[["Little deficit alone","bi"]]},
  {id:"snr", n:"Substantia nigra, pars reticulata", a:"SNr", k:"nuc", sh:["p","M272,136 C236,144 186,152 144,166 L146,174 C188,160 238,152 273,145 Z"], fn:"Basal ganglia output to thalamus and superior colliculus", d:[["{C} parkinsonism and impaired voluntary saccades","contra"]]},
  {id:"snc", n:"Substantia nigra, pars compacta", a:"SNc", k:"nuc", sh:["p","M273,145 C238,152 188,160 146,174 L150,186 C190,172 240,164 275,156 Z"], fn:"Dopaminergic nigrostriatal neurons", d:[["{C} parkinsonism: bradykinesia, rigidity, rest tremor","contra"]]},
  {id:"vta", n:"Ventral tegmental area", a:"VTA", k:"nuc", sh:["e",284,164,12,10], fn:"Mesolimbic and mesocortical dopamine", d:[["Apathy, reduced motivation","bi"]]}
];
const mbView = "Axial, as on MRI: peduncles at the top, colliculi at the bottom";
const mbTerr = (dorsalName, latName, alName, amName) => [
  {id:"lat", n:latName, f:"PCAd", sh:half, clip:"out"},
  {id:"post", n:dorsalName, f:"SCA", sh:["p","M300,300 L238,296 L186,320 L200,440 L300,440 Z"], clip:"out"},
  {id:"al", n:alName, f:"PCAd", sh:["p","M264,124 L130,66 L112,170 L180,200 L246,202 Z"], clip:"out"},
  {id:"am", n:amName, f:"BA", sh:["p","M300,118 L264,124 L246,202 L262,300 L300,302 Z"]}
];

S.push(v({
  id:"mb-u", name:"Upper midbrain (III)", w:600, h:440, outline:MBO,
  view:mbView + " · level of the superior colliculus, red nucleus and third nerve",
  structs:[
    teg("Midbrain reticular formation (ascending arousal system)", "Arousal; mesencephalic locomotor region"),
    {id:"pag", n:"Periaqueductal grey", a:"PAG", k:"nuc", s:"M", sh:["e",300,306,40,30], fn:"Pain modulation, autonomic and vocal control", d:[["Vertical gaze and pupil abnormalities, altered consciousness","bi"]]},
    ...crus,
    {id:"ml", n:"Medial lemniscus", a:"ML", k:"tract", sh:["e",212,218,10,22,30], fn:"Vibration and position sense", d:[D.ml]},
    {id:"vtt", n:"Ventral trigeminothalamic tract", a:"VTT", k:"tract", sh:["e",196,240,7,9], fn:"Facial pain and temperature to VPM", d:[D.vtt]},
    {id:"stt", n:"Spinothalamic tract", a:"STT", k:"tract", sh:["e",180,256,10,13], fn:"Body pain and temperature", d:[D.stt]},
    {id:"bic", n:"Brachium of the inferior colliculus (to the medial geniculate)", a:"BIC", k:"tract", sh:["e",166,300,10,14], fn:"Auditory pathway", d:[["Little hearing loss (bilateral pathways)","bi"]]},
    {id:"ctt", n:"Central tegmental tract", a:"CTT", k:"tract", sh:["e",244,242,8,8], fn:"Red nucleus to inferior olive", d:[D.ctt]},
    {id:"symp", n:"Descending sympathetic (hypothalamospinal) fibers", a:"Sym", k:"tract", sh:["c",212,266,6], fn:"Hypothalamus to the intermediolateral column", d:[D.horner]},
    {id:"rn", n:"Red nucleus (with crossed dentatorubrothalamic fibers)", a:"RN", k:"nuc", sh:["c",260,202,22], fn:"Cerebellar output relay after the decussation", d:[["{C} ataxia and Holmes (rubral) tremor","contra"],["{C} chorea or hemiballism","contra"]]},
    {id:"vtd", n:"Ventral tegmental decussation (rubrospinal fibers crossing)", a:"VTD", k:"tract", s:"M", sh:["e",300,238,14,6], fn:"Rubrospinal tract crossing", d:[["Usually silent","bi"]]},
    {id:"dtd", n:"Dorsal tegmental decussation (tectospinal fibers crossing)", a:"DTD", k:"tract", s:"M", sh:["e",300,258,10,5], fn:"Tectospinal tract crossing", d:[["Usually silent","bi"]]},
    {id:"iiif", n:"Oculomotor fascicle", a:"III-f", k:"tract", sh:["p","M284,262 L294,262 L290,128 L280,130 Z"], fn:"Third nerve fibers running to the interpeduncular fossa", d:[["{I} third nerve palsy: ptosis, eye down and out, dilated pupil","ipsi"]]},
    {id:"mlf", n:"Medial longitudinal fasciculus", a:"MLF", k:"tract", sh:["e",272,268,6,5], fn:"Conjugate gaze", d:[D.mlf]},
    {id:"iiin", n:"Oculomotor nuclear complex", a:"III", k:"nuc", sh:["e",286,282,11,11], fn:"Motor neurons for MR, IR, IO (same side), SR (opposite side), levator (both)", d:[["{I} third nerve palsy with weak {C} superior rectus and ptosis on both sides","ipsi"]]},
    {id:"ew", n:"Edinger–Westphal nucleus", a:"EW", k:"nuc", sh:["c",294,296,4], fn:"Preganglionic parasympathetic to the pupil and lens", d:[["{I} dilated pupil and loss of accommodation","ipsi"]]},
    {id:"inc", n:"Interstitial nucleus of Cajal", a:"INC", k:"nuc", sh:["e",268,292,7,6], fn:"Vertical and torsional gaze holding", d:[["Vertical gaze-evoked nystagmus, skew deviation, ocular tilt reaction","bi"]]},
    {id:"mesv", n:"Mesencephalic trigeminal nucleus", a:"MesV", k:"nuc", sh:["c",262,318,4], fn:"Jaw muscle proprioception", d:[["Usually silent","bi"]]},
    {id:"sc", n:"Superior colliculus", a:"SC", k:"nuc", sh:["e",262,354,34,22], fn:"Reflexive saccades and visual orienting", d:[["Impaired reflexive saccades and orienting toward the {C} field","contra"]]},
    {id:"aq", n:"Cerebral aqueduct", a:"Aq", k:"csf", s:"M", sh:["e",300,312,7,9], d:[["Obstruction causes hydrocephalus","bi"]]},
    {id:"pc", n:"Posterior commissure and pretectal nuclei", a:"PC", k:"tract", s:"M", sh:["e",300,376,26,12], fn:"Upgaze signals; pupillary light reflex", d:[["Upgaze palsy, convergence-retraction nystagmus, light-near dissociation (Parinaud)","bi"]]},
    {id:"ipf", n:"Interpeduncular fossa", a:"IPF", k:"csf", s:"M", sh:["e",300,128,12,8], d:[]}
  ],
  terr:mbTerr(
    "Posterior group: collicular (quadrigeminal) artery and posteromedial choroidal artery (P1–P2), with medial SCA branches: tectum, pretectum",
    "Lateral group: collicular and posteromedial choroidal arteries and lateral SCA branches: lemnisci, spinothalamic tract, brachium",
    "Anterolateral group: anterolateral mesencephalic branches of P1–P2 and the anterior choroidal artery: lateral peduncle, substantia nigra",
    "Anteromedial group: paramedian mesencephalic perforators of the basilar tip and P1 (thalamoperforating trunk / artery of Percheron): CN III, red nucleus, medial peduncle, VTA, MLF"),
  syn:[
    {n:"Weber syndrome", need:[["cst","cbt","crus","fp"],["iiif","iiin"]], t:"Same-side third nerve palsy with opposite face, arm and leg weakness. Anteromedial (paramedian P1 / basilar tip) territory."},
    {n:"Benedikt syndrome", need:[["rn"],["iiif","iiin"],["cst","cbt","snc","snr"]], t:"Same-side third nerve palsy with opposite tremor, chorea or ataxia and hemiparesis (red nucleus plus peduncle)."},
    {n:"Claude syndrome", need:[["rn"],["iiif","iiin"]], not:["cst","cbt","snc","snr","crus"], t:"Same-side third nerve palsy with opposite ataxia and tremor; dorsal red nucleus, no hemiparesis."},
    {n:"Nothnagel (tectal) syndrome", need:[["iiin","iiif"],["sc","pc"]], t:"Third nerve palsy with gaze palsy and ataxia from tectal involvement; usually tumors of the quadrigeminal plate."},
    {n:"Nuclear third nerve palsy", need:[["iiin"]], t:"Third nerve palsy with weak opposite superior rectus and bilateral ptosis (single levator subnucleus)."},
    {n:"Parinaud (dorsal midbrain) syndrome", need:[["pc"]], t:"Upgaze palsy, light-near dissociation, convergence-retraction nystagmus, lid retraction (Collier sign)."},
    {n:"Peduncular pure motor hemiparesis", need:[["cst","crus"]], not:["iiif","iiin","rn"], t:"Opposite face, arm and leg weakness from the crus alone."},
    {n:"Hemiparkinsonism", need:[["snc"]], not:["cst","cbt","fp","crus"], t:"Opposite bradykinesia and rigidity from nigral damage."},
    {n:"Top of the basilar (rostral midbrain)", bi:[["iiin","rn","inc","iiif"]], t:"Bilateral paramedian midbrain infarction: vertical gaze palsy, pupil abnormalities, somnolence; often with thalamic and occipital infarcts."}
  ],
  presets:[
    {n:"Right Weber lesion", sh:[["e",268,140,22,24]]},
    {n:"Left Claude lesion (dorsal red nucleus + III)", sh:[["e",322,226,18,26]]},
    {n:"Dorsal midbrain (pineal) compression", sh:[["e",300,380,46,18]]},
    {n:"Bilateral paramedian (top of basilar)", sh:[["e",300,240,40,50]]}
  ]
}));

S.push(v({
  id:"mb-l", name:"Lower midbrain (IV)", w:600, h:440, outline:MBO,
  view:mbView + " · level of the inferior colliculus and fourth nerve",
  structs:[
    teg("Midbrain reticular formation (ascending arousal system)", "Arousal"),
    {id:"pag", n:"Periaqueductal grey", a:"PAG", k:"nuc", s:"M", sh:["e",300,306,38,30], fn:"Pain modulation, autonomic control", d:[["Altered consciousness, pupil changes","bi"]]},
    ...crus,
    {id:"ipn", n:"Interpeduncular nucleus", a:"IPN", k:"nuc", s:"M", sh:["e",300,136,14,10], fn:"Habenulo-interpeduncular pathway", d:[["Usually silent","bi"]]},
    {id:"ml", n:"Medial lemniscus", a:"ML", k:"tract", sh:["e",208,224,10,20,30], fn:"Vibration and position sense", d:[D.ml]},
    {id:"vtt", n:"Ventral trigeminothalamic tract", a:"VTT", k:"tract", sh:["e",194,244,7,8], fn:"Facial pain and temperature", d:[D.vtt]},
    {id:"stt", n:"Spinothalamic tract", a:"STT", k:"tract", sh:["e",180,262,10,12], fn:"Body pain and temperature", d:[D.stt]},
    {id:"ll", n:"Lateral lemniscus", a:"LL", k:"tract", sh:["e",170,298,10,12], fn:"Auditory pathway to the inferior colliculus", d:[["Mild hearing reduction (bilateral pathways)","bi"]]},
    {id:"ppn", n:"Pedunculopontine nucleus", a:"PPN", k:"nuc", sh:["c",210,284,8], fn:"Gait initiation and posture; cholinergic arousal", d:[["Gait freezing and postural instability","bi"]]},
    {id:"ctt", n:"Central tegmental tract", a:"CTT", k:"tract", sh:["e",246,248,8,8], fn:"Red nucleus to inferior olive", d:[D.ctt]},
    {id:"symp", n:"Descending sympathetic fibers", a:"Sym", k:"tract", sh:["c",222,266,6], fn:"Hypothalamospinal pathway", d:[D.horner]},
    {id:"mlf", n:"Medial longitudinal fasciculus", a:"MLF", k:"tract", sh:["e",272,272,7,5], fn:"Conjugate gaze", d:[D.mlf]},
    {id:"ivn", n:"Trochlear nucleus", a:"IV", k:"nuc", sh:["e",286,284,8,6], fn:"Motor neurons for the opposite superior oblique", d:[["{C} superior oblique palsy (vertical diplopia, worse looking down and in)","contra"]]},
    {id:"ivf", n:"Trochlear fascicle (curving dorsally to cross)", a:"IV-f", k:"tract", sh:["p","M282,292 C258,302 248,330 262,378 L272,376 C260,334 266,308 288,298 Z"], fn:"Fourth nerve fibers before their crossing", d:[["{C} superior oblique palsy","contra"]]},
    {id:"mesv", n:"Mesencephalic trigeminal nucleus and tract", a:"MesV", k:"nuc", sh:["c",262,320,4], fn:"Jaw proprioception", d:[["Usually silent","bi"]]},
    {id:"dr", n:"Dorsal raphe nucleus", a:"DR", k:"nuc", s:"M", sh:["e",300,290,6,8], fn:"Serotonergic projections", d:[["Usually silent","bi"]]},
    {id:"ic", n:"Inferior colliculus", a:"IC", k:"nuc", sh:["e",264,356,32,20], fn:"Auditory relay", d:[["Little hearing loss (bilateral pathways)","bi"]]},
    {id:"scpd", n:"Decussation of the superior cerebellar peduncles", a:"dSCP", k:"tract", s:"M", sh:["e",300,214,40,16], fn:"All dentate and interposed output crosses here", d:[["Ataxia of all four limbs and dysarthria (Wernekink commissure syndrome)","bi"]]},
    {id:"aq", n:"Cerebral aqueduct", a:"Aq", k:"csf", s:"M", sh:["e",300,312,5,7], d:[["Obstruction causes hydrocephalus","bi"]]}
  ],
  terr:mbTerr(
    "Posterior group: medial branches of the superior cerebellar artery and the collicular artery: inferior colliculus, trochlear fascicle",
    "Lateral group: lateral branches of the superior cerebellar artery: lemnisci, spinothalamic tract, pedunculopontine nucleus",
    "Anterolateral group: anterolateral branches of the upper basilar artery and collicular artery: lateral peduncle, substantia nigra",
    "Anteromedial group: paramedian perforators of the upper basilar artery: SCP decussation, MLF, trochlear nucleus, medial peduncle"),
  syn:[
    {n:"Wernekink commissure syndrome", need:[["scpd"]], t:"Ataxia on both sides and dysarthria, often with bilateral INO and later palatal tremor. Anteromedial (paramedian basilar) territory."},
    {n:"Trochlear nucleus syndrome", need:[["ivn","ivf"],["symp"]], t:"Opposite superior oblique palsy with a same-side Horner syndrome."},
    {n:"Internuclear ophthalmoplegia", need:[["mlf"]], t:"Weak adduction of the same-side eye with abducting nystagmus of the other."},
    {n:"Peduncular hemiparesis", need:[["cst","crus"]], t:"Opposite face, arm and leg weakness."},
    {n:"Lateral caudal midbrain (SCA) syndrome", need:[["stt","vtt","ll"]], not:["cst","crus"], t:"Opposite pain and temperature loss in face and body, reduced hearing, sometimes Horner and ataxia; lateral branches of the superior cerebellar artery."}
  ],
  presets:[
    {n:"Midline decussation infarct", sh:[["e",300,220,26,16]]},
    {n:"Right trochlear nucleus and sympathetic", sh:[["e",244,274,46,16]]},
    {n:"Left lateral tegmentum (SCA)", sh:[["e",420,280,26,30]]}
  ]
}));

/* ===== Pons ===== */
const PO = "M300,60 C390,58 470,92 486,160 C496,212 476,262 452,284 C424,312 384,336 340,342 L300,346 L260,342 C216,336 176,312 148,284 C124,262 104,212 114,160 C130,92 210,58 300,60 Z";
const pView = "Axial, as on MRI: basis pontis at the top, fourth ventricle at the bottom";
const BAS = ["p","M300,64 C220,64 140,96 126,160 C122,192 150,216 192,224 L300,228 Z"];
const ponsTerr = (latName, postName, postF) => [
  {id:"lat", n:latName, f:"BA", sh:half, clip:"out"},
  {id:"post", n:postName, f:postF, sh:["p","M300,300 L236,292 L160,286 L170,340 L300,360 Z"], clip:"out"},
  {id:"al", n:"Anterolateral group: short circumferential (anterolateral pontine) branches of the basilar artery: lateral basis, lateral corticospinal bundles", f:"BA", sh:["p","M262,58 L120,110 L116,226 L196,248 L250,232 Z"], clip:"out"},
  {id:"am", n:"Anteromedial group: paramedian (pontine perforating) branches of the basilar artery: medial basis, corticospinal tract, medial lemniscus, paramedian tegmentum", f:"BA", sh:["p","M300,56 L262,58 L250,232 L268,330 L300,346 Z"]}
];

S.push(v({
  id:"p-u", name:"Upper pons (rostral)", w:600, h:400, outline:PO,
  view:pView + " · rostral pons and isthmus, superior cerebellar peduncles entering",
  structs:[
    teg("Pontine reticular formation (nucleus reticularis pontis oralis)", "Arousal, REM sleep"),
    {id:"bas", n:"Basis pontis: pontine nuclei", a:"BP", k:"nuc", sh:BAS, fn:"Cortico-ponto-cerebellar relay to the opposite cerebellum", d:[D.ataxC]},
    {id:"tpf", n:"Transverse pontine fibers (to the middle cerebellar peduncle)", a:"TPF", k:"tract", sh:["p","M150,96 C122,120 112,170 124,206 L150,214 C140,176 146,132 168,104 Z"], fn:"Pontocerebellar fibers", d:[D.ataxI]},
    {id:"cst", n:"Corticospinal bundles", a:"CST", k:"tract", sh:["p","M276,112 C250,106 212,120 192,146 C202,168 240,174 276,168 Z"], fn:"Descending motor fibers", d:[D.wkAL]},
    {id:"cbt", n:"Corticobulbar fibers (dorsomedial bundles)", a:"CBT", k:"tract", sh:["e",282,188,12,10], fn:"To the trigeminal and facial nuclei", d:[D.face,D.dys]},
    {id:"ml", n:"Medial lemniscus", a:"ML", k:"tract", sh:["e",250,238,32,8], fn:"Vibration and position sense", d:[D.ml]},
    {id:"vtt", n:"Trigeminal lemniscus (ventral trigeminothalamic tract)", a:"VTT", k:"tract", sh:["e",204,244,10,7], fn:"Facial sensation to VPM", d:[D.vtt]},
    {id:"stt", n:"Spinothalamic tract", a:"STT", k:"tract", sh:["e",178,254,11,10], fn:"Body pain and temperature", d:[D.stt]},
    {id:"ll", n:"Lateral lemniscus", a:"LL", k:"tract", sh:["e",164,280,10,10], fn:"Auditory pathway", d:[["Hearing reduced mainly in the {C} ear (more crossed fibers)","contra"]]},
    {id:"ctt", n:"Central tegmental tract", a:"CTT", k:"tract", sh:["e",248,272,8,8], fn:"Red nucleus to inferior olive", d:[D.ctt]},
    {id:"symp", n:"Descending sympathetic fibers", a:"Sym", k:"tract", sh:["c",206,268,5], fn:"Hypothalamospinal pathway", d:[D.horner]},
    {id:"scp", n:"Superior cerebellar peduncle", a:"SCP", k:"tract", sh:["e",206,302,18,14], fn:"Cerebellar output before its crossing", d:[["{I} limb ataxia and intention tremor","ipsi"]]},
    {id:"pprf", n:"Paramedian pontine reticular formation (rostral)", a:"PPRF", k:"nuc", sh:["e",272,286,10,12], fn:"Horizontal saccade burst neurons", d:[D.pprf]},
    {id:"mlf", n:"Medial longitudinal fasciculus", a:"MLF", k:"tract", sh:["e",286,304,6,5], fn:"Conjugate horizontal gaze", d:[D.mlf]},
    {id:"lc", n:"Locus coeruleus", a:"LC", k:"nuc", sh:["c",250,322,6], fn:"Noradrenergic arousal", d:[["Usually silent","bi"]]},
    {id:"pmc", n:"Pontine micturition center (Barrington nucleus)", a:"PMC", k:"nuc", sh:["c",234,314,5], fn:"Coordinates bladder emptying", d:[["Urinary retention or detrusor–sphincter dyssynergia (mainly with both sides)","bi"]]},
    {id:"mesv", n:"Mesencephalic trigeminal nucleus", a:"MesV", k:"nuc", sh:["c",222,328,4], fn:"Jaw proprioception", d:[["Usually silent","bi"]]},
    {id:"ivx", n:"Superior medullary velum: crossing trochlear fibers", a:"IVx", k:"tract", s:"M", sh:["e",300,352,22,5], fn:"Both trochlear nerves cross here", d:[["Bilateral superior oblique palsy (trauma)","bi"]]},
    {id:"v4", n:"Fourth ventricle", a:"4V", k:"csf", s:"M", sh:["p","M266,340 L334,340 L300,348 Z"], d:[]}
  ],
  terr:ponsTerr("Lateral group: long circumferential branches and lateral branches of the superior cerebellar artery: lemnisci, spinothalamic tract",
    "Posterior group: superior cerebellar artery (medial branches): superior cerebellar peduncle, locus coeruleus, dorsal tegmentum", "SCA"),
  syn:[
    {n:"Ataxic hemiparesis (ventral pontine lacune)", need:[["cst"],["bas"]], t:"Opposite leg-predominant weakness with ataxia out of proportion. Anteromedial (paramedian) territory."},
    {n:"Dysarthria–clumsy hand (pontine)", need:[["cbt","cst"]], not:["ml","stt"], t:"Dysarthria and opposite hand clumsiness from a basis pontis lacune."},
    {n:"Superior medial pontine syndrome", need:[["cst"],["mlf"]], t:"Opposite face, arm and leg weakness with a same-side INO; sometimes ataxia and palatal myoclonus. Paramedian branches of the upper basilar artery."},
    {n:"Superior lateral pontine (SCA) syndrome", need:[["scp"],["stt","vtt","ll","symp"]], t:"Same-side ataxia, Horner and nystagmus, with opposite pain and temperature loss in face and body and reduced hearing."},
    {n:"Raymond–Céstan (upper dorsal pontine) syndrome", need:[["scp","tpf"],["ml","stt"],["cst"]], t:"Same-side ataxia with opposite sensory loss and hemiparesis, sometimes gaze palsy."},
    {n:"Internuclear ophthalmoplegia", need:[["mlf"]], t:"Same-side adduction weakness with abducting nystagmus of the other eye."},
    {n:"Locked-in syndrome", bi:[["cst"]], t:"Bilateral basis pontis infarction (basilar thrombosis): quadriplegia, anarthria; vertical gaze and blinking preserved."}
  ],
  presets:[
    {n:"Left ventral pontine lacune", sh:[["e",350,150,14,16]]},
    {n:"Right dorsolateral pons (SCA)", sh:[["e",196,280,30,30]]},
    {n:"Right paramedian (superior medial pontine)", sh:[["p","M298,100 L272,100 L262,240 L272,306 L298,310 Z"]]},
    {n:"Bilateral ventral pons (basilar)", sh:[["e",300,140,90,44]]}
  ]
}));

S.push(v({
  id:"p-m", name:"Middle pons (V)", w:600, h:400, outline:PO,
  view:pView + " · midpons, entry of the trigeminal nerve",
  structs:[
    teg("Pontine reticular formation", "Arousal"),
    {id:"bas", n:"Basis pontis: pontine nuclei", a:"BP", k:"nuc", sh:BAS, fn:"Cortico-ponto-cerebellar relay", d:[D.ataxC]},
    {id:"mcp", n:"Middle cerebellar peduncle", a:"MCP", k:"tract", sh:["p","M156,90 C118,118 104,176 118,214 L156,224 C138,180 146,128 176,98 Z"], fn:"Pontocerebellar fibers to the same-side cerebellum", d:[D.ataxI]},
    {id:"cst", n:"Corticospinal bundles", a:"CST", k:"tract", sh:["p","M276,112 C250,106 206,118 186,148 C198,170 240,176 276,170 Z"], fn:"Descending motor fibers", d:[D.wkAL]},
    {id:"cbt", n:"Corticobulbar fibers", a:"CBT", k:"tract", sh:["e",282,190,12,10], fn:"To the trigeminal, facial and lower nuclei", d:[D.face,D.dys]},
    {id:"ml", n:"Medial lemniscus", a:"ML", k:"tract", sh:["e",250,238,32,8], fn:"Vibration and position sense", d:[D.ml]},
    {id:"vtt", n:"Trigeminal lemniscus", a:"VTT", k:"tract", sh:["e",206,246,9,7], fn:"Facial sensation", d:[D.vtt]},
    {id:"stt", n:"Spinothalamic tract", a:"STT", k:"tract", sh:["e",176,256,11,9], fn:"Body pain and temperature", d:[D.stt]},
    {id:"ll", n:"Lateral lemniscus", a:"LL", k:"tract", sh:["e",164,282,9,9], fn:"Auditory pathway", d:[["Hearing reduced mainly in the {C} ear","contra"]]},
    {id:"ctt", n:"Central tegmental tract", a:"CTT", k:"tract", sh:["e",246,278,8,8], fn:"Red nucleus to inferior olive", d:[D.ctt]},
    {id:"symp", n:"Descending sympathetic fibers", a:"Sym", k:"tract", sh:["c",226,294,5], fn:"Hypothalamospinal pathway", d:[D.horner]},
    {id:"vroot", n:"Trigeminal nerve root (sensory and motor)", a:"V-r", k:"tract", sh:["p","M114,196 L200,250 L206,240 L120,184 Z"], fn:"Crosses the MCP to the trigeminal nuclei", d:[["{I} facial numbness and weak chewing","ipsi"]]},
    {id:"vmot", n:"Trigeminal motor nucleus", a:"V-m", k:"nuc", sh:["c",214,266,10], fn:"Muscles of mastication", d:[["{I} jaw weakness; jaw deviates to the {I} side on opening","ipsi"]]},
    {id:"vps", n:"Principal (chief) sensory trigeminal nucleus", a:"V-s", k:"nuc", sh:["c",190,282,10], fn:"Facial touch and corneal sensation", d:[["{I} loss of facial touch; reduced corneal reflex","ipsi"]]},
    {id:"spvt", n:"Spinal trigeminal tract (start)", a:"spVt", k:"tract", sh:["e",174,304,8,8], fn:"Facial pain and temperature fibers descending", d:[D.spv]},
    {id:"pprf", n:"Paramedian pontine reticular formation", a:"PPRF", k:"nuc", sh:["e",272,288,10,12], fn:"Horizontal saccade burst neurons", d:[D.pprf]},
    {id:"mlf", n:"Medial longitudinal fasciculus", a:"MLF", k:"tract", sh:["e",286,306,6,5], fn:"Conjugate horizontal gaze", d:[D.mlf]},
    {id:"mesv", n:"Mesencephalic trigeminal tract", a:"MesV", k:"tract", sh:["c",230,326,4], fn:"Jaw proprioception", d:[["Reduced jaw jerk","ipsi"]]},
    {id:"v4", n:"Fourth ventricle", a:"4V", k:"csf", s:"M", sh:["p","M246,342 L354,342 L300,368 Z"], d:[]}
  ],
  terr:ponsTerr("Lateral group: long circumferential branches of the basilar artery, with rostral AICA branches laterally: trigeminal nuclei and root, MCP",
    "Posterior group: superior cerebellar artery and long circumferential branches: dorsal tegmentum", "SCA"),
  syn:[
    {n:"Ventral midpontine syndrome", need:[["cst"]], not:["vmot","vps","vroot"], t:"Opposite hemiparesis with dysarthria and often ataxia (pure motor, ataxic hemiparesis or dysarthria–clumsy hand). Paramedian or short circumferential branches."},
    {n:"Lateral midpontine syndrome", need:[["vmot","vps","vroot","spvt"],["mcp"]], t:"Same-side facial numbness, weak chewing and limb ataxia. Short and long circumferential branches."},
    {n:"Medial midpontine syndrome", need:[["cst"],["ml"]], t:"Opposite hemiparesis with opposite loss of vibration and position sense; paramedian basilar branches."},
    {n:"Locked-in syndrome", bi:[["cst"]], t:"Bilateral basis pontis infarction from basilar thrombosis."}
  ],
  presets:[
    {n:"Right lateral midpons", sh:[["e",176,232,34,30]]},
    {n:"Left ventral midpons", sh:[["e",350,140,24,22]]}
  ]
}));

const PLO = "M300,64 C386,62 462,94 478,160 C488,210 476,262 452,288 C424,316 384,338 340,344 L300,346 L260,344 C216,338 176,316 148,288 C124,262 112,210 122,160 C138,94 214,62 300,64 Z";
S.push(v({
  id:"p-l", name:"Lower pons (VI, VII)", w:600, h:400, outline:PLO,
  view:pView + " · caudal pons, at the facial colliculus",
  structs:[
    teg("Pontine reticular formation (nucleus reticularis pontis caudalis)", "Arousal, horizontal gaze"),
    {id:"bas", n:"Basis pontis: pontine nuclei", a:"BP", k:"nuc", sh:["p","M300,68 C224,68 148,98 134,160 C130,190 156,214 196,222 L300,226 Z"], fn:"Cortico-ponto-cerebellar relay", d:[D.ataxC]},
    {id:"cst", n:"Corticospinal tract", a:"CST", k:"tract", sh:["p","M282,112 C250,106 212,120 194,148 C206,170 246,176 282,170 Z"], fn:"Descending motor fibers (facial fibers have mostly left)", d:[D.wkAL]},
    {id:"icp", n:"Middle and inferior cerebellar peduncles", a:"CP", k:"tract", sh:["p","M150,98 C116,124 106,180 122,222 L164,240 C142,192 150,138 176,106 Z"], fn:"Cerebellar input", d:[D.ataxI]},
    {id:"ml", n:"Medial lemniscus", a:"ML", k:"tract", sh:["e",250,232,32,7], fn:"Vibration and position sense", d:[D.ml]},
    {id:"tb", n:"Trapezoid body (crossing auditory fibers)", a:"TB", k:"tract", s:"M", sh:["e",300,246,62,5], fn:"Cochlear nuclei to the opposite superior olive", d:[["Impaired sound localization","bi"]]},
    {id:"stt", n:"Spinothalamic tract", a:"STT", k:"tract", sh:["e",176,252,11,9], fn:"Body pain and temperature", d:[D.stt]},
    {id:"so", n:"Superior olivary nucleus", a:"SO", k:"nuc", sh:["e",220,260,9,7], fn:"Sound localization", d:[["Mild hearing difficulty (bilateral pathways)","bi"]]},
    {id:"ctt", n:"Central tegmental tract", a:"CTT", k:"tract", sh:["e",240,280,8,8], fn:"Red nucleus to inferior olive", d:[D.ctt]},
    {id:"symp", n:"Descending sympathetic fibers", a:"Sym", k:"tract", sh:["c",208,290,5], fn:"Hypothalamospinal pathway", d:[D.horner]},
    {id:"spv", n:"Spinal trigeminal nucleus and tract", a:"spV", k:"nuc", sh:["e",178,298,10,12], fn:"Facial pain and temperature", d:[D.spv]},
    {id:"ssn", n:"Superior salivatory nucleus", a:"SSN", k:"nuc", sh:["c",222,302,5], fn:"Lacrimal, submandibular and sublingual secretion (VII)", d:[["{I} dry eye and reduced salivation","ipsi"]]},
    {id:"vnl", n:"Lateral vestibular nucleus (Deiters)", a:"LVN", k:"nuc", sh:["e",196,322,13,9], fn:"Lateral vestibulospinal tract (antigravity tone)", d:[D.vest]},
    {id:"vnm", n:"Medial vestibular nucleus", a:"MVN", k:"nuc", sh:["e",228,328,16,9], fn:"VOR, horizontal gaze holding", d:[D.vest]},
    {id:"viin", n:"Facial motor nucleus", a:"VII", k:"nuc", sh:["c",196,268,10], fn:"Muscles of facial expression", d:[["{I} lower motor neuron facial palsy (forehead included)","ipsi"]]},
    {id:"pprf", n:"Paramedian pontine reticular formation (caudal)", a:"PPRF", k:"nuc", sh:["e",276,284,10,12], fn:"Horizontal saccade burst neurons", d:[D.pprf]},
    {id:"omn", n:"Omnipause neurons (nucleus raphe interpositus)", a:"OPN", k:"nuc", s:"M", sh:["e",300,292,5,8], fn:"Gate all saccades", d:[["Slow saccades in all directions; possibly opsoclonus or flutter","bi"]]},
    {id:"vin", n:"Abducens nucleus", a:"VI", k:"nuc", sh:["c",262,314,12], fn:"Lateral rectus motor neurons and internuclear neurons", d:[["Horizontal gaze palsy toward the {I} side (both eyes)","ipsi"]]},
    {id:"mlf", n:"Medial longitudinal fasciculus", a:"MLF", k:"tract", sh:["e",286,304,6,5], fn:"Conjugate horizontal gaze", d:[D.mlf]},
    {id:"vif", n:"Abducens fascicle", a:"VI-f", k:"tract", sh:["p","M260,300 L270,300 L262,90 L252,92 Z"], fn:"Sixth nerve fibers running ventrally", d:[["{I} lateral rectus palsy: abduction deficit, horizontal diplopia","ipsi"]]},
    {id:"genu", n:"Facial nerve genu (facial colliculus)", a:"VII-g", k:"tract", sh:["p","M248,312 C246,330 258,336 276,330 L274,322 C262,326 256,322 256,312 Z"], fn:"Facial fibers looping over the abducens nucleus", d:[["{I} lower motor neuron facial palsy","ipsi"]]},
    {id:"viif", n:"Facial nerve fascicle (exiting)", a:"VII-f", k:"tract", sh:["p","M262,312 L140,220 L132,230 L254,322 Z"], fn:"Facial fibers leaving the pons laterally", d:[["{I} lower motor neuron facial palsy","ipsi"]]},
    {id:"v4", n:"Fourth ventricle", a:"4V", k:"csf", s:"M", sh:["p","M240,344 L360,344 L300,372 Z"], d:[]}
  ],
  terr:ponsTerr("Lateral group: AICA (long circumferential): facial nucleus, spinal trigeminal, vestibular nuclei, cerebellar peduncles",
    "Posterior group: AICA and long circumferential branches: vestibular nuclei and dorsolateral floor", "AICA"),
  syn:[
    {n:"Millard–Gubler syndrome", need:[["cst"],["vif"],["viif","viin","genu"]], t:"Same-side abducens and facial palsy with opposite hemiparesis (ventral caudal pons)."},
    {n:"Raymond syndrome", need:[["cst"],["vif"]], not:["viif","viin","genu"], t:"Same-side lateral rectus palsy with opposite hemiparesis."},
    {n:"Foville (inferior medial pontine) syndrome", need:[["vin","pprf"],["viin","genu","viif"]], t:"Same-side horizontal gaze palsy and facial palsy, with opposite hemiparesis and sensory loss when the basis and lemniscus are involved."},
    {n:"One-and-a-half syndrome", need:[["vin","pprf"],["mlf"]], t:"Same-side gaze palsy plus INO: only the other eye abducts."},
    {n:"Eight-and-a-half syndrome", need:[["vin","pprf"],["mlf"],["genu","viif","viin"]], t:"One-and-a-half syndrome plus a same-side facial palsy."},
    {n:"Internuclear ophthalmoplegia", need:[["mlf"]], not:["vin"], t:"Same-side adduction weakness with abducting nystagmus of the other eye."},
    {n:"Gasperini syndrome", need:[["vif","vin"],["viin","genu","viif"],["spv","vnl","vnm"],["stt","ml"]], t:"Caudal pontine tegmentum: same-side V, VI, VII and VIII involvement with opposite hemisensory loss."},
    {n:"Marie–Foix (lateral pontine) syndrome", need:[["icp"],["cst"],["stt"]], t:"Same-side ataxia with opposite hemiparesis and opposite pain and temperature loss; short circumferential branches or AICA."},
    {n:"Lateral inferior pontine (AICA) syndrome", need:[["vnl","vnm"],["spv","viin","stt","symp"]], t:"Vertigo, same-side deafness (labyrinthine artery), facial palsy, facial numbness, Horner and ataxia, with opposite pain and temperature loss."},
    {n:"Locked-in syndrome", bi:[["cst"]], t:"Bilateral ventral pontine infarction from basilar thrombosis."}
  ],
  presets:[
    {n:"Right ventral caudal pons (Millard–Gubler)", sh:[["p","M262,110 L180,120 L130,170 L132,232 L170,250 L260,230 Z"]]},
    {n:"Left dorsal pons, one-and-a-half", sh:[["e",330,306,22,18]]},
    {n:"Right AICA lateral pons", sh:[["e",186,296,40,40]]},
    {n:"Right lateral pons (Marie–Foix)", sh:[["p","M150,110 L232,150 L236,190 L200,262 L150,240 Z"]]}
  ]
}));

/* ===== Pontomedullary junction ===== */
const PMJ = "M300,84 C372,84 432,104 452,150 C468,192 462,236 440,268 C420,298 384,322 340,330 L300,334 L260,330 C216,322 180,298 160,268 C138,236 132,192 148,150 C168,104 228,84 300,84 Z";
S.push(v({
  id:"pmj", name:"Pontomedullary junction (VIII)", w:600, h:400, outline:PMJ,
  view:"Axial, as on MRI: front at the top · where VI, VII and VIII leave the brainstem, cochlear nuclei on the inferior peduncle",
  structs:[
    teg("Reticular formation (caudal pons, rostral medulla)", "Arousal, cardiorespiratory control"),
    {id:"cst", n:"Corticospinal tract (forming the pyramid)", a:"CST", k:"tract", sh:["e",266,124,28,22], fn:"Descending motor fibers", d:[D.wkALnoFace]},
    {id:"olive", n:"Inferior olive (rostral pole)", a:"ION", k:"nuc", sh:["e",230,154,18,14], fn:"Climbing fibers to the opposite cerebellum", d:[["Usually silent acutely","bi"]]},
    {id:"ml", n:"Medial lemniscus", a:"ML", k:"tract", sh:["e",286,182,9,28], fn:"Vibration and position sense", d:[D.ml]},
    {id:"stt", n:"Spinothalamic tract", a:"STT", k:"tract", sh:["e",196,194,12,10], fn:"Body pain and temperature", d:[D.stt]},
    {id:"ctt", n:"Central tegmental tract", a:"CTT", k:"tract", sh:["c",252,232,7], fn:"Red nucleus to inferior olive", d:[D.ctt]},
    {id:"symp", n:"Descending sympathetic fibers", a:"Sym", k:"tract", sh:["c",226,238,5], fn:"Hypothalamospinal pathway", d:[D.horner]},
    {id:"amb", n:"Nucleus ambiguus (rostral, retrofacial)", a:"Amb", k:"nuc", sh:["c",236,214,6], fn:"Pharynx and larynx (IX, X)", d:[["{I} dysphagia, hoarseness","ipsi"]]},
    {id:"spv", n:"Spinal trigeminal nucleus and tract", a:"spV", k:"nuc", sh:["e",210,250,10,14], fn:"Facial pain and temperature", d:[D.spv]},
    {id:"icp", n:"Inferior cerebellar peduncle", a:"ICP", k:"tract", sh:["e",194,268,16,22], fn:"Spinocerebellar, olivocerebellar, vestibulocerebellar input", d:[D.ataxI,["Lateropulsion toward the {I} side","ipsi"]]},
    {id:"viiir", n:"Vestibulocochlear nerve root (cerebellopontine angle)", a:"VIII", k:"tract", sh:["p","M148,192 L214,228 L208,238 L142,202 Z"], fn:"Hearing and vestibular afferents entering", d:[["{I} deafness and tinnitus","ipsi"],["Vertigo and nystagmus","ipsi"]]},
    {id:"viir", n:"Facial nerve root (exiting, anterior to VIII)", a:"VII", k:"tract", sh:["p","M152,168 L232,214 L226,224 L146,178 Z"], fn:"Facial motor, taste and parasympathetic fibers", d:[["{I} lower motor neuron facial palsy, with loss of taste and tearing","ipsi"]]},
    {id:"vif", n:"Abducens nerve fibers (exiting at the pontomedullary sulcus)", a:"VI", k:"tract", sh:["p","M272,96 L282,96 L286,214 L276,214 Z"], fn:"Sixth nerve leaving near the midline", d:[["{I} lateral rectus palsy","ipsi"]]},
    {id:"vcn", n:"Ventral cochlear nucleus", a:"VCN", k:"nuc", sh:["e",168,240,10,9], fn:"First auditory relay", d:[["{I} deafness","ipsi"]]},
    {id:"dcn", n:"Dorsal cochlear nucleus", a:"DCN", k:"nuc", sh:["e",176,288,9,8], fn:"First auditory relay", d:[["{I} deafness","ipsi"]]},
    {id:"vni", n:"Inferior vestibular nucleus", a:"IVN", k:"nuc", sh:["e",222,286,13,9], fn:"Vestibulocerebellar and vestibulospinal relay", d:[D.vest]},
    {id:"vnl", n:"Lateral vestibular nucleus", a:"LVN", k:"nuc", sh:["e",204,306,11,8], fn:"Lateral vestibulospinal tract", d:[D.vest]},
    {id:"vnm", n:"Medial vestibular nucleus", a:"MVN", k:"nuc", sh:["e",248,306,16,10], fn:"VOR and horizontal gaze holding", d:[D.vest]},
    {id:"nph", n:"Nucleus prepositus hypoglossi", a:"NPH", k:"nuc", sh:["e",282,306,8,10], fn:"Horizontal neural integrator", d:[["Horizontal gaze-evoked nystagmus; nystagmus beating toward the {I} side","ipsi"]]},
    {id:"mlf", n:"Medial longitudinal fasciculus", a:"MLF", k:"tract", sh:["c",288,262,6], fn:"Vestibulo-ocular pathways", d:[["Nystagmus, skew deviation","bi"]]},
    {id:"v4", n:"Fourth ventricle with lateral recess", a:"4V", k:"csf", s:"M", sh:["p","M216,328 L384,328 L360,358 L240,358 Z"], d:[]}
  ],
  terr:[
    {id:"lat", n:"Lateral group: AICA, with the labyrinthine (internal auditory) artery to the inner ear: VII and VIII roots, cochlear nuclei, peduncle, spinal trigeminal", f:"AICA", sh:half, clip:"out"},
    {id:"post", n:"Posterior group: PICA (medial branches) and AICA: vestibular nuclei, prepositus, floor of the fourth ventricle", f:"PICA", sh:["p","M300,296 L230,276 L188,290 L196,350 L300,350 Z"], clip:"out"},
    {id:"al", n:"Anterolateral group: short circumferential branches of the lower basilar and vertebral arteries: olive, spinothalamic tract", f:"VA", sh:["p","M262,82 L150,110 L140,196 L210,216 L256,190 Z"], clip:"out"},
    {id:"am", n:"Anteromedial group: paramedian branches of the vertebrobasilar junction: corticospinal tract, abducens fibers, medial lemniscus", f:"BA", sh:["p","M300,80 L262,82 L256,190 L272,280 L300,290 Z"]}
  ],
  syn:[
    {n:"Cerebellopontine angle / lateral pontomedullary (AICA) syndrome", need:[["vcn","dcn","viiir"],["viir","spv","icp"]], t:"Same-side deafness and tinnitus, vertigo, facial palsy, facial numbness and ataxia. AICA infarct, or a mass (vestibular schwannoma, meningioma) at the angle."},
    {n:"Vestibular nuclear syndrome (pseudo-vestibular neuritis)", need:[["vnl","vnm","vni"]], not:["cst","vcn","dcn"], t:"Acute vertigo and nystagmus that can mimic vestibular neuritis; check the head impulse test, skew and direction-changing nystagmus (HINTS)."},
    {n:"Prepositus hypoglossi lesion", need:[["nph"]], t:"Horizontal gaze-evoked nystagmus, often with ipsipulsion of saccades; small paramedian infarcts or MS."},
    {n:"Ventral pontomedullary syndrome", need:[["cst"],["vif"]], t:"Same-side lateral rectus palsy with opposite hemiparesis."}
  ],
  presets:[
    {n:"Right cerebellopontine angle (AICA)", sh:[["e",176,236,36,40]]},
    {n:"Left vestibular nuclei", sh:[["e",360,302,30,14]]}
  ]
}));

/* ===== Medulla ===== */
const MUO = "M300,92 C342,92 382,98 406,122 C432,152 438,202 426,242 C414,282 386,318 352,332 L300,338 L248,332 C214,318 186,282 174,242 C162,202 168,152 194,122 C218,98 258,92 300,92 Z";
const medTerr = (postName) => [
  {id:"lat", n:"Lateral group: lateral medullary branches of the vertebral artery and PICA: spinothalamic tract, spinal trigeminal, ambiguus, sympathetic fibers", f:"VA", sh:half, clip:"out"},
  {id:"post", n:postName, f:"PICA", sh:["p","M300,298 L240,272 L176,262 L190,350 L300,350 Z"], clip:"out"},
  {id:"al", n:"Anterolateral group: anterolateral branches of the vertebral and anterior spinal arteries: olive, rootlets of XII", f:"VA", sh:["p","M262,90 L186,110 L166,196 L214,208 L250,160 Z"], clip:"out"},
  {id:"am", n:"Anteromedial group: anterior spinal artery and paramedian vertebral branches: pyramid, medial lemniscus, MLF, hypoglossal nucleus and nerve", f:"ASA", sh:["p","M300,88 L262,90 L248,160 L262,300 L300,320 Z"]}
];
S.push(v({
  id:"m-u", name:"Upper medulla (IX, X)", w:600, h:400, outline:MUO,
  view:"Axial, as on MRI: pyramids at the top, fourth ventricle at the bottom · rostral medulla, mid-olive",
  structs:[
    teg("Medullary reticular formation", "Breathing, blood pressure and swallowing pattern generators"),
    {id:"pyr", n:"Pyramid (corticospinal tract)", a:"Pyr", k:"tract", sh:["e",276,120,22,18], fn:"Corticospinal fibers before the decussation", d:[D.wkALnoFace]},
    {id:"olive", n:"Inferior olivary nucleus", a:"ION", k:"nuc", sh:["e",236,146,24,20], fn:"Climbing fibers to the opposite cerebellum", d:[["Usually silent acutely; hypertrophic degeneration after lesions of its inputs","bi"]]},
    {id:"ml", n:"Medial lemniscus", a:"ML", k:"tract", sh:["e",290,174,8,34], fn:"Vibration and position sense", d:[D.ml]},
    {id:"rvlm", n:"Rostral ventrolateral medulla (vasomotor center)", a:"RVLM", k:"nuc", sh:["c",214,172,7], fn:"Sympathetic tone and blood pressure", d:[["Blood pressure instability; orthostatic hypotension if both sides","bi"]]},
    {id:"prebot", n:"Pre-Bötzinger complex (respiratory rhythm generator)", a:"PBC", k:"nuc", sh:["c",236,194,6], fn:"Inspiratory rhythm", d:[["Breathing irregularity; central hypoventilation if both sides (Ondine curse)","bi"]]},
    {id:"stt", n:"Spinothalamic tract", a:"STT", k:"tract", sh:["e",194,198,12,10], fn:"Body pain and temperature", d:[D.stt]},
    {id:"ixr", n:"Glossopharyngeal and vagus rootlets (exiting)", a:"IX-X", k:"tract", sh:["p","M222,220 L180,148 L172,154 L214,226 Z"], fn:"Branchial motor and visceral fibers leaving behind the olive", d:[["{I} absent gag, palate and vocal cord weakness","ipsi"]]},
    {id:"amb", n:"Nucleus ambiguus", a:"Amb", k:"nuc", sh:["c",226,222,6], fn:"Palate, pharynx and larynx (IX, X)", d:[["{I} palate and vocal cord weakness: dysphagia, hoarseness, absent gag","ipsi"]]},
    {id:"symp", n:"Descending sympathetic fibers", a:"Sym", k:"tract", sh:["c",210,240,5], fn:"Hypothalamospinal pathway", d:[D.horner]},
    {id:"spv", n:"Spinal trigeminal nucleus and tract", a:"spV", k:"nuc", sh:["e",186,244,11,16], fn:"Facial pain and temperature", d:[D.spv]},
    {id:"isn", n:"Inferior salivatory nucleus", a:"ISN", k:"nuc", sh:["c",244,262,4], fn:"Parotid secretion (IX)", d:[["{I} reduced parotid secretion","ipsi"]]},
    {id:"icp", n:"Inferior cerebellar peduncle", a:"ICP", k:"tract", sh:["e",198,288,16,20], fn:"Spinocerebellar, olivocerebellar, vestibulocerebellar input", d:[["{I} limb ataxia, lateropulsion","ipsi"]]},
    {id:"vni", n:"Inferior vestibular nucleus", a:"IVN", k:"nuc", sh:["e",220,302,12,9], fn:"Vestibular relay", d:[D.vest]},
    {id:"vnm", n:"Medial vestibular nucleus", a:"MVN", k:"nuc", sh:["e",244,312,13,9], fn:"VOR, gaze holding", d:[D.vest]},
    {id:"nts", n:"Nucleus of the solitary tract", a:"NTS", k:"nuc", sh:["e",258,296,7,8], fn:"Taste and visceral afferents (VII, IX, X)", d:[["{I} loss of taste; baroreflex failure (labile blood pressure) if both sides","ipsi"]]},
    {id:"dmnx", n:"Dorsal motor nucleus of the vagus", a:"DMNX", k:"nuc", sh:["e",272,302,6,6], fn:"Vagal parasympathetic output to heart and gut", d:[["Tachycardia, gut dysmotility","bi"]]},
    {id:"rol", n:"Perihypoglossal nuclei (intercalatus, Roller)", a:"PHN", k:"nuc", sh:["c",278,318,4], fn:"Vertical gaze holding", d:[["Upbeat nystagmus","bi"]]},
    {id:"mlf", n:"Medial longitudinal fasciculus and tectospinal tract", a:"MLF", k:"tract", sh:["e",290,228,6,6], fn:"Vestibulo-ocular and head orienting", d:[["Nystagmus, vertical gaze-holding problems","bi"]]},
    {id:"xiin", n:"Hypoglossal nucleus", a:"XII", k:"nuc", sh:["e",288,308,8,8], fn:"Tongue muscles", d:[["{I} tongue weakness and atrophy; tongue deviates to the {I} side","ipsi"]]},
    {id:"xiif", n:"Hypoglossal fascicle", a:"XII-f", k:"tract", sh:["p","M282,300 L290,300 L258,112 L250,114 Z"], fn:"Exits between pyramid and olive", d:[["{I} tongue weakness; tongue deviates to the {I} side","ipsi"]]},
    {id:"v4", n:"Fourth ventricle (floor)", a:"4V", k:"csf", s:"M", sh:["p","M248,336 L352,336 L338,364 L262,364 Z"], d:[]}
  ],
  terr:medTerr("Posterior group: PICA (posterior medullary branches): inferior cerebellar peduncle, vestibular nuclei, solitary nucleus, dorsal vagal nucleus"),
  syn:[
    {n:"Lateral medullary (Wallenberg) syndrome", need:[["spv"],["amb","stt","symp","vni","vnm","icp","ixr"]], t:"Vertigo, nausea, same-side facial pain and temperature loss (often facial pain), Horner, dysphagia, hoarseness and limb ataxia, with opposite body pain and temperature loss; skew deviation with same-side hypotropia, ocular and body lateropulsion toward the lesion, hiccups. Rostral lesions give more dysphagia, hoarseness and facial weakness. Horner, ipsilateral ataxia and contralateral hypalgesia together identify it. Intracranial vertebral artery (often dissection) more often than PICA."},
    {n:"Medial medullary (Dejerine) syndrome", need:[["pyr"],["ml","xiif","xiin"]], t:"Same-side tongue weakness with opposite hemiparesis (face usually spared) and opposite loss of vibration and position sense. The hypoglossal fibers run lateral to the lemniscus and pyramid, so the tongue may be spared (pure motor hemiparesis); a central facial palsy can occur because some corticofacial fibers loop down into the medulla. Anterior spinal or paramedian vertebral branches."},
    {n:"Hemimedullary (Babinski–Nageotte) syndrome", need:[["pyr"],["spv","amb","icp"]], t:"Lateral medullary syndrome plus opposite hemiparesis; intracranial vertebral artery."},
    {n:"Avellis syndrome", need:[["amb","ixr"],["stt"]], not:["spv"], t:"Same-side palate and vocal cord paralysis with opposite pain and temperature loss."},
    {n:"Jackson syndrome", need:[["xiin","xiif"],["amb"],["pyr"]], t:"Same-side tongue, palate and vocal cord paralysis with opposite hemiparesis."},
    {n:"Upbeat nystagmus (perihypoglossal)", need:[["rol"]], t:"Primary-position upbeat nystagmus from the paramedian caudal medulla."},
    {n:"Bilateral medial medullary syndrome", bi:[["pyr"]], t:"Quadriparesis, bilateral tongue weakness, sensory loss; heart-shaped infarct on diffusion MRI."},
    {n:"Central hypoventilation (bilateral ventrolateral medulla)", bi:[["prebot","rvlm"]], t:"Loss of automatic breathing, especially during sleep, with blood pressure instability."}
  ],
  presets:[
    {n:"Right lateral medulla (Wallenberg)", sh:[["p","M182,200 C176,236 184,276 210,300 C232,300 244,280 240,250 C236,224 226,206 212,196 Z"]]},
    {n:"Left medial medulla (Dejerine)", sh:[["p","M302,104 L332,108 L326,320 L304,326 Z"]]},
    {n:"Right hemimedulla (Babinski–Nageotte)", sh:[["p","M298,96 L240,96 L176,150 L176,260 L220,312 L298,330 Z"]]}
  ]
}));

const MMO = "M300,100 C344,100 386,108 406,132 C428,160 432,206 420,244 C408,282 380,310 348,322 L300,328 L252,322 C220,310 192,282 180,244 C168,206 172,160 194,132 C214,108 256,100 300,100 Z";
S.push(v({
  id:"m-m", name:"Middle medulla (obex, XII)", w:600, h:380, outline:MMO,
  view:"Axial, as on MRI: front at the top · level of the obex and area postrema",
  structs:[
    teg("Medullary reticular formation", "Breathing and blood pressure"),
    {id:"pyr", n:"Pyramid (corticospinal tract)", a:"Pyr", k:"tract", sh:["e",276,126,22,18], fn:"Corticospinal fibers", d:[D.wkALnoFace]},
    {id:"olive", n:"Inferior olive (caudal part)", a:"ION", k:"nuc", sh:["e",238,152,18,15], fn:"Climbing fibers", d:[["Usually silent","bi"]]},
    {id:"ml", n:"Medial lemniscus", a:"ML", k:"tract", sh:["e",288,180,8,30], fn:"Vibration and position sense", d:[D.ml]},
    {id:"vlm", n:"Ventrolateral medulla (respiratory and vasomotor neurons)", a:"VLM", k:"nuc", sh:["c",222,192,7], fn:"Breathing rhythm and sympathetic tone", d:[["Breathing and blood pressure instability, especially if both sides","bi"]]},
    {id:"stt", n:"Spinothalamic tract", a:"STT", k:"tract", sh:["e",198,206,11,10], fn:"Body pain and temperature", d:[D.stt]},
    {id:"amb", n:"Nucleus ambiguus", a:"Amb", k:"nuc", sh:["c",228,222,6], fn:"Pharynx, larynx", d:[["{I} dysphagia, hoarseness","ipsi"]]},
    {id:"symp", n:"Descending sympathetic fibers", a:"Sym", k:"tract", sh:["c",212,234,5], fn:"Hypothalamospinal pathway", d:[D.horner]},
    {id:"spv", n:"Spinal trigeminal nucleus and tract", a:"spV", k:"nuc", sh:["e",190,246,11,16], fn:"Facial pain and temperature", d:[D.spv]},
    {id:"dsct", n:"Dorsal spinocerebellar tract", a:"DSCT", k:"tract", sh:["e",184,278,8,12], fn:"Leg proprioception to the cerebellum", d:[["{I} leg ataxia","ipsi"]]},
    {id:"accu", n:"Accessory cuneate nucleus", a:"ACN", k:"nuc", sh:["c",222,292,6], fn:"Arm proprioception to the cerebellum", d:[["{I} arm ataxia","ipsi"]]},
    {id:"cu", n:"Cuneate nucleus", a:"Cu", k:"nuc", sh:["e",246,310,11,9], fn:"Arm vibration and position", d:[["{I} loss of vibration and position sense in the arm","ipsi"]]},
    {id:"gr", n:"Gracile nucleus", a:"Gr", k:"nuc", sh:["e",276,316,9,8], fn:"Leg vibration and position", d:[["{I} loss of vibration and position sense in the leg","ipsi"]]},
    {id:"nts", n:"Nucleus of the solitary tract", a:"NTS", k:"nuc", sh:["c",256,290,6], fn:"Visceral and taste afferents", d:[["{I} loss of taste; labile blood pressure if both sides","ipsi"]]},
    {id:"dmnx", n:"Dorsal motor nucleus of the vagus", a:"DMNX", k:"nuc", sh:["c",272,286,5], fn:"Vagal parasympathetic output", d:[["Tachycardia, gut dysmotility","bi"]]},
    {id:"mlf", n:"Medial longitudinal fasciculus and tectospinal tract", a:"MLF", k:"tract", sh:["e",290,232,6,6], fn:"Vestibulospinal and head orienting", d:[["Nystagmus","bi"]]},
    {id:"xiin", n:"Hypoglossal nucleus", a:"XII", k:"nuc", sh:["c",288,282,6], fn:"Tongue muscles", d:[["{I} tongue weakness and atrophy; tongue deviates to the {I} side","ipsi"]]},
    {id:"xiif", n:"Hypoglossal fascicle", a:"XII-f", k:"tract", sh:["p","M284,276 L292,276 L258,118 L250,120 Z"], fn:"Exits between pyramid and olive", d:[["{I} tongue weakness","ipsi"]]},
    {id:"ap", n:"Area postrema", a:"AP", k:"nuc", s:"M", sh:["e",300,330,12,6], fn:"Chemoreceptor trigger zone (no blood-brain barrier)", d:[["Intractable nausea, vomiting and hiccups (area postrema syndrome)","bi"]]},
    {id:"cc", n:"Central canal (opening into the fourth ventricle)", a:"CC", k:"csf", s:"M", sh:["c",300,306,5], d:[]}
  ],
  terr:[
    {id:"lat", n:"Lateral group: lateral medullary branches of the vertebral artery: ambiguus, spinal trigeminal, spinothalamic tract", f:"VA", sh:half, clip:"out"},
    {id:"post", n:"Posterior group: PICA and posterior spinal artery: gracile, cuneate and solitary nuclei, area postrema", f:"PSA", sh:["p","M300,292 L240,276 L176,262 L190,350 L300,350 Z"], clip:"out"},
    {id:"al", n:"Anterolateral group: anterolateral branches of the vertebral and anterior spinal arteries: olive", f:"VA", sh:["p","M262,98 L188,116 L170,196 L216,210 L252,166 Z"], clip:"out"},
    {id:"am", n:"Anteromedial group: anterior spinal artery: pyramid, medial lemniscus, hypoglossal nucleus and nerve", f:"ASA", sh:["p","M300,96 L262,98 L252,166 L264,296 L300,300 Z"]}
  ],
  syn:[
    {n:"Medial medullary (Dejerine) syndrome", need:[["pyr"],["ml","xiif","xiin"]], t:"Same-side tongue weakness with opposite hemiparesis sparing the face and opposite proprioceptive loss. Anterior spinal artery."},
    {n:"Lateral medullary syndrome (caudal)", need:[["spv"],["amb","stt","symp"]], t:"Caudal Wallenberg pattern: more vertigo, nystagmus and gait ataxia, less dysphagia and hoarseness than rostral lesions (Brazis); dissection is commoner with caudal lesions. Vertebral artery."},
    {n:"Area postrema syndrome", need:[["ap"]], t:"Unexplained intractable hiccups, nausea and vomiting; classic onset of aquaporin-4 neuromyelitis optica spectrum disorder."},
    {n:"Posterior column nuclei syndrome", need:[["gr","cu"]], t:"Same-side loss of vibration and position sense with sensory ataxia; posterior spinal artery."}
  ],
  presets:[
    {n:"Area postrema lesion", sh:[["e",300,326,16,10]]},
    {n:"Left medial medulla (Dejerine)", sh:[["p","M302,110 L330,114 L326,300 L304,304 Z"]]},
    {n:"Right caudal lateral medulla", sh:[["e",204,232,26,32]]}
  ]
}));

const MLO = "M300,112 C362,112 410,142 420,200 C428,262 390,322 300,332 C210,322 172,262 180,200 C190,142 238,112 300,112 Z";
S.push(v({
  id:"m-l", name:"Lower medulla (decussations)", w:600, h:380, outline:MLO,
  view:"Axial, as on MRI: front at the top · closed medulla, level of the motor and sensory decussations",
  structs:[
    teg("Caudal medullary reticular formation", "Respiratory pattern generators"),
    {id:"lcst", n:"Lateral corticospinal tract (crossed fibers, dorsolateral)", a:"lCST", k:"tract", sh:["e",232,196,14,12], fn:"Corticospinal fibers after crossing", d:[["{I} arm and leg weakness (fibers have already crossed)","ipsi"]]},
    {id:"stt", n:"Spinothalamic tract", a:"STT", k:"tract", sh:["e",212,228,12,12], fn:"Pain and temperature", d:[["{C} loss of pain and temperature in the body","contra"]]},
    {id:"sct", n:"Dorsal and ventral spinocerebellar tracts", a:"SCT", k:"tract", sh:["e",198,256,9,16], fn:"Unconscious proprioception", d:[D.ataxI]},
    {id:"rst", n:"Rubrospinal and lateral reticulospinal tracts", a:"RST", k:"tract", sh:["e",224,216,6,6], fn:"Motor tone and arm flexion", d:[["Usually little deficit alone","bi"]]},
    {id:"symp", n:"Descending sympathetic fibers", a:"Sym", k:"tract", sh:["c",222,250,5], fn:"Hypothalamospinal pathway", d:[D.horner]},
    {id:"acc", n:"Spinal accessory nucleus and C1 ventral horn", a:"XI", k:"nuc", sh:["e",252,226,8,8], fn:"Sternocleidomastoid and trapezius", d:[["{I} weak shoulder shrug and weak head turning to the {C} side","ipsi"]]},
    {id:"spv", n:"Spinal trigeminal nucleus and tract (caudal)", a:"spV", k:"nuc", sh:["e",222,276,12,16], fn:"Facial pain and temperature", d:[["{I} loss of facial pain and temperature (outer face first, onion-skin pattern)","ipsi"]]},
    {id:"cu", n:"Cuneate nucleus and fasciculus", a:"Cu", k:"nuc", sh:["e",258,296,14,16], fn:"Arm position and vibration", d:[["{I} loss of vibration and position sense in the arm","ipsi"]]},
    {id:"gr", n:"Gracile nucleus and fasciculus", a:"Gr", k:"nuc", sh:["e",286,300,12,16], fn:"Leg position and vibration", d:[["{I} loss of vibration and position sense in the leg","ipsi"]]},
    {id:"xiin", n:"Hypoglossal nucleus (caudal)", a:"XII", k:"nuc", sh:["c",290,244,6], fn:"Tongue muscles", d:[["{I} tongue weakness","ipsi"]]},
    {id:"dmn", n:"Dorsal motor nucleus of the vagus and caudal solitary nucleus", a:"DMNX", k:"nuc", sh:["c",276,256,6], fn:"Vagal output; visceral sensation", d:[["Autonomic instability","bi"]]},
    {id:"pdec", n:"Pyramidal (motor) decussation", a:"PyrX", k:"tract", s:"M", sh:["e",300,150,42,22], fn:"Corticospinal fibers crossing (arm fibers higher and more medial)", d:[["Weakness of both arms more than legs, or crossed arm and leg weakness (cruciate paralysis)","bi"]]},
    {id:"sdec", n:"Internal arcuate fibers (sensory decussation)", a:"IAF", k:"tract", s:"M", sh:["e",300,206,30,10], fn:"Gracile and cuneate output crossing", d:[["Loss of vibration and position sense on both sides","bi"]]},
    {id:"cc", n:"Central canal", a:"CC", k:"csf", s:"M", sh:["c",300,252,5], d:[]}
  ],
  terr:[
    {id:"lat", n:"Lateral group: lateral branches of the vertebral artery (and PICA): spinothalamic, spinocerebellar, lateral corticospinal, spinal trigeminal", f:"VA", sh:half, clip:"out"},
    {id:"post", n:"Posterior group: posterior spinal artery: gracile and cuneate nuclei and fasciculi, dorsal spinal trigeminal", f:"PSA", sh:["p","M300,340 L300,268 L240,262 L196,280 L230,336 Z"], clip:"out"},
    {id:"am", n:"Anteromedial group: anterior spinal artery: decussations, medial structures, hypoglossal nucleus", f:"ASA", sh:["p","M300,108 L250,116 L236,200 L270,250 L300,256 Z"]}
  ],
  syn:[
    {n:"Cruciate paralysis", need:[["pdec"]], t:"Arm weakness more than leg because arm fibers cross higher and more medially; anterior spinal artery, trauma, odontoid fracture."},
    {n:"Opalski syndrome", need:[["lcst"],["spv","stt"]], t:"Lateral medullary syndrome with same-side hemiparesis, because the corticospinal fibers have already crossed at this level. Vertebral artery."},
    {n:"Posterior spinal artery syndrome", need:[["gr","cu"]], t:"Same-side loss of vibration and position sense with sensory ataxia; sometimes same-side facial numbness."},
    {n:"Cervicomedullary hemisection pattern", need:[["lcst"],["stt"],["gr","cu"]], t:"Same-side weakness and proprioceptive loss with opposite pain and temperature loss (Brown-Séquard-like)."}
  ],
  presets:[
    {n:"Midline decussation", sh:[["e",300,152,36,18]]},
    {n:"Right caudal lateral medulla (Opalski)", sh:[["e",220,232,26,40]]},
    {n:"Right dorsal columns (posterior spinal)", sh:[["e",270,300,28,18]]}
  ]
}));
})();
