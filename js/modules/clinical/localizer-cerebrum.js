/* Neuro Localizer: additional cerebral slices (vertex, midbrain/temporal level, anterior and posterior
   coronal, posterior fossa). Same conventions as localizer-slices.js. Load after it, before the brainstem file. */
(function () {
const S = window.LOC_SLICES = window.LOC_SLICES || [];
const D = {
  wkFAL: ["{C} face, arm and leg weakness (upper motor neuron)", "contra"],
  hemisens: ["{C} hemisensory loss", "contra"],
  hemianopia: ["{C} homonymous hemianopia", "contra"],
  ataxI: ["{I} limb ataxia", "ipsi"],
  ataxC: ["{C} limb ataxia", "contra"],
  amnesia: ["Anterograde amnesia (verbal if left, visual if right; severe if both sides)", "bi"]
};
const AX = "M300,28 C430,28 528,140 532,300 C536,470 450,620 300,628 C150,620 64,470 68,300 C72,140 170,28 300,28 Z";
const AXH = "M298,30 C176,34 74,140 70,300 C66,470 150,616 298,626 Z";
const AXI = "M262,84 C190,90 124,170 120,300 C116,440 176,552 262,566 Z";

/* ---------------- Axial · vertex ---------------- */
S.push({
  id:"ax-vx", group:"Cerebrum", name:"Axial · vertex (centrum semiovale)", w:600, h:640, center:[200,310],
  view:"Axial, high convexity above the ventricles · front at the top",
  outline:"M300,70 C420,70 500,160 504,300 C508,450 430,560 300,566 C170,560 92,450 96,300 C100,160 180,70 300,70 Z",
  hemi:"M298,72 C186,74 102,160 98,300 C94,450 174,560 298,564 Z",
  inner:"M262,116 C200,122 140,190 136,300 C132,420 190,512 262,520 Z",
  structs:[
    {id:"wmf", n:"Centrum semiovale: frontal association fibers (SLF I, frontal aslant tract)", a:"F-WM", k:"wm", sh:["w",300,90], clip:"wm", fn:"Links SMA, premotor and prefrontal cortex", d:[["Reduced initiation and verbal fluency","bi"],["Transcortical motor aphasia (frontal aslant tract)","bi","L"]]},
    {id:"wmp", n:"Centrum semiovale: parietal association fibers", a:"P-WM", k:"wm", sh:["w",90,300], clip:"wm", fn:"Parietal association and thalamocortical fibers", d:[["{C} cortical sensory loss","contra"],["{C} neglect","contra","R"]]},
    {id:"sma", n:"Supplementary motor area and pre-SMA (medial superior frontal gyrus)", a:"SMA", k:"ctx", sh:["w",25,75], clip:"ctx", fn:"Self-initiated and sequenced movement", d:[["{C} akinesia and leg-predominant weakness that improves over days","contra"],["Transcortical motor aphasia (sparse speech, repetition preserved)","bi","L"],["Alien hand with callosal involvement","contra"]]},
    {id:"pcl", n:"Paracentral lobule (leg motor and sensory cortex)", a:"PCL", k:"ctx", sh:["w",75,120], clip:"ctx", fn:"Leg and foot movement and sensation; voluntary bladder control", d:[["{C} leg and foot weakness and sensory loss","contra"],["Urinary incontinence (more with both sides)","bi"]]},
    {id:"pcun", n:"Precuneus", a:"PCun", k:"ctx", sh:["w",120,160], clip:"ctx", fn:"Visuospatial imagery, self-awareness", d:[["Topographical disorientation","bi"]]},
    {id:"pfc", n:"Superior and middle frontal gyri (prefrontal convexity, frontal eye field)", a:"PFC", k:"ctx", sh:["w",330,25], clip:"ctx", fn:"Executive function; voluntary saccades (posterior MFG)", d:[["Dysexecutive syndrome","bi"],["Eyes deviate toward the {I} side acutely","ipsi"]]},
    {id:"m1h", n:"Precentral gyrus: hand knob (primary motor cortex)", a:"M1", k:"ctx", sh:["w",280,330], clip:"ctx", fn:"Hand and finger movement", d:[["{C} hand weakness, often finger extensors or ulnar fingers; can mimic a radial or ulnar nerve palsy","contra"]]},
    {id:"s1", n:"Postcentral gyrus (hand and arm sensation)", a:"S1", k:"ctx", sh:["w",250,280], clip:"ctx", fn:"Discriminative touch and position", d:[["{C} astereognosis, agraphesthesia, impaired two-point discrimination and position sense in the hand","contra"]]},
    {id:"spl", n:"Superior parietal lobule", a:"SPL", k:"ctx", sh:["w",160,250], clip:"ctx", fn:"Visually guided reaching, body schema", d:[["{C} optic ataxia","contra"],["{C} cortical sensory loss","contra"]]},
    {id:"csm", n:"Centrum semiovale: corticospinal fibers (leg medial, arm lateral)", a:"CS-m", k:"tract", sh:["e",230,300,22,48], fn:"Descending motor fibers from the precentral gyrus", d:[D.wkFAL]},
    {id:"slf", n:"Superior longitudinal fasciculus II", a:"SLF", k:"tract", sh:["e",170,320,13,58], fn:"Parietal to frontal attention network", d:[["{C} hemispatial neglect","contra","R"],["Ideomotor apraxia","bi","L"]]}
  ],
  terr:[
    {id:"mcas", n:"MCA superior division (M4): prerolandic, rolandic and anterior parietal branches", f:"MCA", sh:["w",230,15]},
    {id:"mcap", n:"MCA posterior parietal branch (inferior division, M4)", f:"MCA", sh:["w",175,230]},
    {id:"aca", n:"ACA (A3–A4): callosomarginal (paracentral, superior frontal) and pericallosal (precuneal) branches", f:"ACA", sh:["w",15,150]},
    {id:"pca", n:"PCA (P4): parieto-occipital branch", f:"PCA", sh:["w",150,175]},
    {id:"ws", n:"ACA–MCA border zone (parasagittal watershed)", f:"WS", sh:["p","M226,96 L250,96 L250,544 L226,544 Z"], clip:"hemi"},
    {id:"med", n:"MCA medullary (superficial perforating) arteries; a chain of small lesions here is the internal border zone", f:"MCAd", sh:["e",226,310,22,120]}
  ],
  syn:[
    {n:"Leg monoparesis (paracentral, ACA)", need:[["pcl"]], t:"Weakness and numbness of the opposite leg and foot; ACA callosomarginal branch. Look for abulia and incontinence."},
    {n:"Hand knob infarct", need:[["m1h"]], not:["pcl","csm","s1"], t:"Isolated weakness of the opposite hand that mimics a peripheral nerve palsy; usually an embolic MCA rolandic branch."},
    {n:"Cortical sensory syndrome", need:[["s1"]], t:"Astereognosis and agraphesthesia with preserved pain and temperature; parietal cortex."},
    {n:"Pure motor hemiparesis (centrum semiovale)", need:[["csm"]], not:["m1h","s1","pcl","sma","spl"], t:"Small deep infarct in the corona/centrum semiovale; medullary perforators or a border-zone lesion."},
    {n:"Bilateral border-zone infarcts (man in a barrel)", bi:[["csm","m1h"]], t:"Proximal arm and shoulder weakness on both sides with legs and face relatively spared, after profound hypotension or bilateral carotid disease."},
    {n:"SMA syndrome", need:[["sma"]], t:"Akinesia and opposite leg weakness that improve over days; transcortical motor aphasia if dominant."}
  ],
  presets:[
    {n:"Left hand knob", sh:[["e",488,238,14,14]]},
    {n:"Right paracentral lobule (ACA)", sh:[["e",280,322,14,26]]},
    {n:"Bilateral watershed chains", sh:[["e",228,250,8,8],["e",228,290,8,8],["e",230,330,8,8],["e",372,250,8,8],["e",372,290,8,8],["e",370,330,8,8]]}
  ]
});

/* ---------------- Axial · midbrain and temporal lobes ---------------- */
S.push({
  id:"ax-ml", group:"Cerebrum", name:"Axial · midbrain and temporal lobes", w:600, h:660, center:[196,330],
  view:"Axial, through the suprasellar cistern, midbrain and medial temporal lobes · front at the top", outline:AX, hemi:AXH, inner:AXI,
  structs:[
    {id:"wmf", n:"Orbitofrontal white matter", a:"F-WM", k:"wm", sh:["p","M298,40 L298,196 L244,200 L196,216 L118,224 L110,120 L200,50 Z"], clip:"wm", fn:"Orbitofrontal connections", d:[["Disinhibition, apathy","bi"]]},
    {id:"wmo", n:"Occipital white matter (ventral optic radiation)", a:"O-WM", k:"wm", sh:["w",100,200], clip:"wm", fn:"Lower optic radiation fibers", d:[["{C} superior quadrantanopia or hemianopia","contra"]]},
    {id:"wmt", n:"Temporal white matter (Meyer loop, uncinate, inferior longitudinal fasciculus)", a:"T-WM", k:"wm", sh:["e",172,334,48,100], clip:"wm", fn:"Visual radiation loop and temporal association fibers", d:[["{C} superior quadrantanopia (Meyer loop)","contra"],["Naming and semantic deficits","bi","L"]]},
    {id:"wmh", n:"Perihippocampal white matter (fimbria, cingulum, wall of the temporal horn)", a:"pH-WM", k:"wm", sh:["e",234,322,30,62], clip:"wm", fn:"Hippocampal output and limbic connections", d:[["Memory impairment","bi"]]},
    {id:"ofc", n:"Gyrus rectus and medial orbitofrontal cortex", a:"OFC", k:"ctx", sh:["w",345,85], clip:"ctx", fn:"Social behaviour, reward, inhibition", d:[["Disinhibition, impulsivity, poor judgment","bi"]]},
    {id:"lofc", n:"Lateral orbitofrontal cortex and pars orbitalis", a:"lOFC", k:"ctx", sh:["w",300,345], clip:"ctx", fn:"Emotional regulation; semantic retrieval (left)", d:[["Personality change, poor judgment","bi"]]},
    {id:"tp", n:"Temporal pole and anterior temporal lobe", a:"TP", k:"ctx", sh:["w",255,300], clip:"ctx", fn:"Semantic memory, social knowledge", d:[["Semantic deficits: loss of word meaning and object knowledge","bi","L"],["Loss of person knowledge, behavioural change","bi","R"]]},
    {id:"itg", n:"Middle and inferior temporal gyri", a:"ITG", k:"ctx", sh:["w",215,255], clip:"ctx", fn:"Semantic and visual object memory", d:[["Anomia","bi","L"],["Visual memory difficulties","bi","R"]]},
    {id:"fus", n:"Fusiform gyrus (ventral temporo-occipital)", a:"Fus", k:"ctx", sh:["w",180,215], clip:"ctx", fn:"Faces (right), written words (left), colour", d:[["Prosopagnosia (worse with both sides)","bi","R"],["Pure alexia (visual word form area)","bi","L"],["{C} hemiachromatopsia","contra"]]},
    {id:"lin", n:"Lingual gyrus and lower calcarine cortex (V1)", a:"Lin", k:"ctx", sh:["w",125,180], clip:"ctx", fn:"Upper visual field; colour (V4)", d:[["{C} superior homonymous quadrantanopia","contra"],["Achromatopsia if both sides","bi"]]},
    {id:"phg", n:"Posterior parahippocampal gyrus", a:"PHG", k:"ctx", sh:["w",95,125], clip:"ctx", fn:"Scene memory and navigation", d:[["Topographic agnosia (getting lost)","bi"]]},
    {id:"olf", n:"Olfactory tract", a:"Olf", k:"tract", sh:["e",276,150,4,26], fn:"Smell", d:[["{I} anosmia","ipsi"]]},
    {id:"vs", n:"Ventral striatum (nucleus accumbens)", a:"NAc", k:"nuc", sh:["e",268,212,10,8], fn:"Reward and motivation", d:[["Apathy, reduced motivation","bi"]]},
    {id:"bf", n:"Basal forebrain (nucleus basalis, substantia innominata)", a:"BF", k:"nuc", sh:["e",262,234,14,8], fn:"Cholinergic projection to cortex and hippocampus", d:[["Amnesia with confabulation (often after ACoA aneurysm rupture)","bi"]]},
    {id:"amyg", n:"Amygdala", a:"Amy", k:"nuc", sh:["e",214,268,16,14], fn:"Fear, emotional memory, social signals", d:[["Reduced fear and emotional memory; with both sides, Klüver–Bucy syndrome","bi"]]},
    {id:"unc", n:"Uncus and entorhinal cortex", a:"Unc", k:"ctx", sh:["e",234,290,10,12], fn:"Gateway to the hippocampus; olfactory cortex", d:[["Memory impairment; olfactory auras in seizures","bi"]]},
    {id:"th", n:"Temporal horn", a:"TH", k:"csf", sh:["e",204,306,5,16], d:[]},
    {id:"hip", n:"Hippocampus (head and body)", a:"Hip", k:"ctx", sh:["e",214,326,12,32,-10], fn:"Episodic memory", d:[D.amnesia]},
    {id:"ot", n:"Optic tract", a:"OT", k:"tract", sh:["e",250,272,14,4,-30], fn:"Retinal fibers to the lateral geniculate", d:[["{C} incongruous homonymous hemianopia with an RAPD in the {C} eye","contra"]]},
    {id:"crus", n:"Cerebral peduncle", a:"CP", k:"tract", sh:["p","M290,284 L262,286 L248,304 L256,330 L290,322 Z"], fn:"Corticospinal and corticobulbar fibers", d:[D.wkFAL]},
    {id:"mteg", n:"Midbrain tegmentum (red nucleus, CN III nucleus, reticular formation)", a:"Teg", k:"nuc", sh:["p","M290,322 L256,330 L262,358 L290,360 Z"], fn:"Third nerve, cerebellar output, arousal", d:[["{I} third nerve palsy","ipsi"],["{C} ataxia or tremor","contra"],["Reduced consciousness if both sides","bi","BOTH"]]},
    {id:"hy", n:"Hypothalamus", a:"Hy", k:"nuc", s:"M", sh:["e",300,246,22,14], fn:"Temperature, appetite, thirst, sleep, endocrine and autonomic control", d:[["Diabetes insipidus, temperature and appetite disturbance, hypopituitarism","bi"]]},
    {id:"mb", n:"Mammillary bodies", a:"MB", k:"nuc", s:"M", sh:["e",300,268,12,6], fn:"Papez circuit", d:[["Anterograde amnesia (Korsakoff)","bi"]]},
    {id:"och", n:"Optic chiasm", a:"OCh", k:"tract", s:"M", sh:["e",300,224,20,6], fn:"Crossing nasal retinal fibers", d:[["Bitemporal hemianopia","bi"]]},
    {id:"ipc", n:"Interpeduncular cistern", a:"IPC", k:"csf", s:"M", sh:["e",300,292,10,9], d:[]},
    {id:"aq", n:"Cerebral aqueduct", a:"Aq", k:"csf", s:"M", sh:["e",300,364,4,5], d:[["Obstruction causes hydrocephalus","bi"]]},
    {id:"tect", n:"Tectum (superior colliculi, pretectum)", a:"Tect", k:"nuc", s:"M", sh:["e",300,378,24,10], fn:"Vertical gaze and pupillary reflexes", d:[["Upgaze palsy, light-near dissociation (Parinaud)","bi"]]},
    {id:"verm", n:"Superior cerebellar vermis (culmen)", a:"Vs", k:"ctx", s:"M", sh:["e",300,420,30,22], fn:"Gait and posture", d:[["Gait and truncal ataxia","bi"]]}
  ],
  terr:[
    {id:"mca", n:"MCA (M2–M3): lateral orbitofrontal and middle temporal branches", f:"MCA", sh:["w",215,345]},
    {id:"ata", n:"Anterior temporal artery (from M1)", f:"MCA", sh:["w",262,300]},
    {id:"aca", n:"ACA (A2): orbitofrontal and frontopolar branches", f:"ACA", sh:["w",345,95]},
    {id:"pca", n:"PCA (P2–P4): anterior and posterior temporal, hippocampal and calcarine branches", f:"PCA", sh:["w",95,215]},
    {id:"phip", n:"PCA hippocampal and anterior temporal branches (P2): hippocampus, parahippocampal gyrus", f:"PCA", sh:["e",220,336,22,42,-10]},
    {id:"amyg", n:"Anterior choroidal artery and uncal branch of M1: amygdala", f:"AChA", sh:["e",214,266,20,17]},
    {id:"heub", n:"Recurrent artery of Heubner and medial lenticulostriate arteries (A1): accumbens, basal forebrain", f:"ACAd", sh:["e",264,222,18,16]},
    {id:"acha", n:"Anterior choroidal artery (ICA): uncus, medial amygdala, hippocampal head, optic tract", f:"AChA", sh:["p","M226,262 L262,262 L262,290 L232,312 L212,290 Z"]},
    {id:"shy", n:"Superior hypophyseal arteries (ICA): optic chiasm", f:"ICA", sh:["e",290,226,12,8]},
    {id:"pcom", n:"Premammillary (thalamotuberal) and hypothalamic perforators of the posterior communicating artery", f:"PCom", sh:["e",290,256,12,20]},
    {id:"pmed", n:"Paramedian mesencephalic perforators (P1 and basilar tip)", f:"PCAd", sh:["p","M300,284 L276,284 L270,360 L300,362 Z"]},
    {id:"pcirc", n:"Short circumferential branches of P1–P2 (peduncular rami)", f:"PCAd", sh:["p","M276,284 L248,300 L256,356 L270,360 Z"]},
    {id:"coll", n:"Collicular (quadrigeminal) artery (P1)", f:"PCAd", sh:["e",290,378,14,10]},
    {id:"sca", n:"Superior cerebellar artery: superior vermis", f:"SCA", sh:["e",290,420,16,22]}
  ],
  syn:[
    {n:"Klüver–Bucy syndrome", bi:[["amyg","tp"]], t:"Placidity, hyperorality, hypersexuality and visual agnosia from bilateral anterior temporal damage (herpes simplex encephalitis, trauma)."},
    {n:"Bilateral hippocampal amnesia", bi:[["hip","unc"]], t:"Severe anterograde amnesia: bilateral PCA infarction, hypoxia, herpes simplex or limbic encephalitis."},
    {n:"Hippocampal infarct (PCA)", need:[["hip"]], t:"Memory impairment, verbal if left and visual if right; often with a homonymous field defect from the same PCA occlusion. Severe amnesia needs both sides."},
    {n:"Prosopagnosia", only:"R", need:[["fus"]], t:"Inability to recognize faces from right (or bilateral) fusiform damage; PCA territory."},
    {n:"Pure alexia (visual word form area)", only:"L", need:[["fus"]], t:"Letter-by-letter reading with intact writing from left fusiform damage; left PCA."},
    {n:"Semantic (anterior temporal) syndrome", only:"L", need:[["tp"]], t:"Loss of word meaning and object knowledge; anterior temporal artery, semantic dementia, encephalitis."},
    {n:"Weber syndrome", need:[["crus"],["mteg"]], t:"Same-side third nerve palsy with opposite hemiparesis; paramedian P1 perforators."},
    {n:"Optic tract syndrome", need:[["ot"]], t:"Incongruous homonymous hemianopia with an RAPD in the eye on the side of the field loss; anterior choroidal artery."},
    {n:"Chiasmal syndrome", need:[["och"]], t:"Bitemporal hemianopia; pituitary tumors, craniopharyngioma, meningioma."},
    {n:"Hypothalamic syndrome", need:[["hy"]], t:"Diabetes insipidus, temperature and appetite disturbance, sleep change, hypopituitarism."},
    {n:"Basal forebrain amnesia", need:[["bf"]], t:"Amnesia with confabulation and personality change, typically after anterior communicating artery aneurysm rupture."},
    {n:"Parinaud (dorsal midbrain) syndrome", need:[["tect"]], t:"Upgaze palsy, light-near dissociation, convergence-retraction nystagmus."}
  ],
  presets:[
    {n:"Right hippocampal (PCA) infarct", sh:[["e",220,330,14,30,-10]]},
    {n:"Left anterior choroidal territory", sh:[["e",360,282,14,16]]},
    {n:"Both amygdalae and temporal poles", sh:[["e",214,262,22,16],["e",386,262,22,16]]},
    {n:"Left fusiform gyrus", sh:[["e",472,540,18,16]]}
  ]
});

/* ---------------- Coronal · anterior ---------------- */
S.push({
  id:"cor-a", group:"Cerebrum", name:"Coronal · anterior (caudate head)", w:600, h:500, center:[196,250],
  view:"Coronal, through the caudate head, anterior limb and anterior commissure · top of the head up",
  outline:"M300,40 C420,36 540,110 548,240 C556,350 520,420 470,450 C440,470 400,470 370,452 L330,420 L300,428 L270,420 L230,452 C200,470 160,470 130,450 C80,420 44,350 52,240 C60,110 180,36 300,40 Z",
  hemi:"M298,42 C180,40 60,110 54,240 C46,350 80,420 130,450 C160,470 200,470 230,452 L270,420 L298,428 Z",
  inner:"M290,80 C200,80 98,140 92,240 C86,330 110,390 150,414 C180,430 214,428 240,410 L270,390 L298,396 Z",
  structs:[
    {id:"cr", n:"Corona radiata (anterior: frontal projection fibers, anterior thalamic radiation)", a:"CR", k:"wm", sh:["w",290,90], clip:"wm", fn:"Frontal connections and descending fibers", d:[["Abulia, executive dysfunction","bi"],["{C} face and arm weakness if posterior fibers are involved","contra"]]},
    {id:"tstem", n:"Temporal stem (uncinate and inferior fronto-occipital fasciculi)", a:"TS", k:"wm", sh:["w",180,290], clip:"wm", fn:"Frontal to temporal connections", d:[["Semantic and naming deficits","bi","L"],["Behavioural change","bi","R"]]},
    {id:"sfg", n:"Superior frontal gyrus (medial: pre-SMA)", a:"SFG", k:"ctx", sh:["w",0,60], clip:"ctx", fn:"Initiation of action and speech", d:[["Abulia; transcortical motor aphasia if dominant","bi"],["{C} leg weakness","contra"]]},
    {id:"mfg", n:"Middle frontal gyrus (dorsolateral prefrontal cortex)", a:"MFG", k:"ctx", sh:["w",320,360], clip:"ctx", fn:"Executive control, working memory", d:[["Dysexecutive syndrome","bi"]]},
    {id:"ifg", n:"Inferior frontal gyrus (Broca area on the left)", a:"IFG", k:"ctx", sh:["w",285,320], clip:"ctx", fn:"Speech production; prosody (right)", d:[["Broca (nonfluent) aphasia with apraxia of speech","bi","L"],["Expressive aprosodia","bi","R"]]},
    {id:"stg", n:"Anterior superior temporal gyrus and temporal pole", a:"aSTG", k:"ctx", sh:["w",240,285], clip:"ctx", fn:"Auditory association, semantic memory", d:[["Semantic deficits","bi","L"]]},
    {id:"itg", n:"Anterior middle and inferior temporal gyri", a:"aITG", k:"ctx", sh:["w",195,240], clip:"ctx", fn:"Semantic memory", d:[["Anomia","bi","L"]]},
    {id:"cing", n:"Anterior cingulate gyrus", a:"ACC", k:"ctx", sh:["e",276,166,20,12], fn:"Motivation, error monitoring", d:[["Apathy; akinetic mutism if both sides","bi"]]},
    {id:"lv", n:"Lateral ventricle, frontal horn", a:"FH", k:"csf", sh:["e",266,214,20,13,18], d:[]},
    {id:"cau", n:"Caudate head", a:"Cd", k:"nuc", sh:["e",242,226,15,20], fn:"Associative and limbic loops", d:[["Abulia, apathy, disinhibition","bi"],["{C} chorea (rare)","contra"]]},
    {id:"alic", n:"Anterior limb of the internal capsule", a:"ALIC", k:"tract", sh:["p","M224,204 L236,206 L228,300 L216,298 Z"], fn:"Frontopontine fibers and anterior thalamic radiation", d:[["Abulia, executive dysfunction","bi"],["Mild {C} face and arm weakness","contra"]]},
    {id:"ins", n:"Insular cortex (anterior)", a:"Ins", k:"ctx", sh:["p","M146,228 C138,256 138,296 148,320 L154,318 C146,294 146,258 152,232 Z"], fn:"Speech planning, interoception, taste", d:[["Apraxia of speech","bi","L"],["Autonomic disturbance","bi","R"]]},
    {id:"ext", n:"External capsule and claustrum", a:"EC", k:"wm", sh:["e",166,264,5,36], fn:"Corticocortical fibers", d:[["Often silent","bi"]]},
    {id:"put", n:"Putamen", a:"Put", k:"nuc", sh:["e",190,262,17,40], fn:"Motor and associative striatum", d:[["{C} dystonia or hemichorea","contra"],["{C} hemiparesis if the capsule is involved","contra"]]},
    {id:"gpe", n:"Globus pallidus (externa)", a:"GPe", k:"nuc", sh:["e",210,280,8,22], fn:"Indirect pathway", d:[["{C} dystonia","contra"]]},
    {id:"nac", n:"Nucleus accumbens (ventral striatum)", a:"NAc", k:"nuc", sh:["e",246,272,12,10], fn:"Reward and motivation", d:[["Apathy","bi"]]},
    {id:"bf", n:"Basal forebrain (nucleus basalis of Meynert, substantia innominata)", a:"BF", k:"nuc", sh:["e",238,310,24,8], fn:"Cholinergic projection to cortex", d:[["Amnesia with confabulation","bi"]]},
    {id:"amyg", n:"Amygdala", a:"Amy", k:"nuc", sh:["e",214,370,18,14], fn:"Fear and emotional memory", d:[["Reduced fear; Klüver–Bucy if both sides","bi"]]},
    {id:"cc", n:"Corpus callosum (genu and body)", a:"CC", k:"tract", s:"M", sh:["p","M222,186 C260,170 340,170 378,186 L374,200 C340,188 260,188 226,200 Z"], fn:"Connects the frontal lobes", d:[["Callosal disconnection: left-hand apraxia, alien hand","bi"]]},
    {id:"sept", n:"Septum pellucidum and septal nuclei", a:"Sep", k:"nuc", s:"M", sh:["e",300,224,5,22], fn:"Limbic relay", d:[["Memory and emotional change","bi"]]},
    {id:"fx", n:"Fornix (columns)", a:"Fx", k:"tract", s:"M", sh:["e",300,262,6,10], fn:"Hippocampal output", d:[["Anterograde amnesia","bi"]]},
    {id:"ac", n:"Anterior commissure", a:"AC", k:"tract", s:"M", sh:["e",300,290,70,5], fn:"Connects the temporal lobes and olfactory structures", d:[["Rarely symptomatic alone","bi"]]},
    {id:"hy", n:"Hypothalamus (preoptic and anterior)", a:"Hy", k:"nuc", s:"M", sh:["e",300,322,14,14], fn:"Temperature (heat loss), sleep onset, fluid balance", d:[["Hyperthermia, insomnia, diabetes insipidus","bi"]]},
    {id:"och", n:"Optic chiasm", a:"OCh", k:"tract", s:"M", sh:["e",300,348,22,6], fn:"Crossing nasal fibers", d:[["Bitemporal hemianopia","bi"]]}
  ],
  terr:[
    {id:"mcas", n:"MCA superior division (M2–M4): prefrontal and opercular branches", f:"MCA", sh:["w",280,360]},
    {id:"mcat", n:"MCA temporal branches, including the anterior temporal artery (M1)", f:"MCA", sh:["w",200,280]},
    {id:"aca", n:"ACA (A2–A3): pericallosal and callosomarginal branches", f:"ACA", sh:["w",0,80]},
    {id:"pcat", n:"PCA anterior temporal branch (P2)", f:"PCA", sh:["w",150,200]},
    {id:"ws", n:"Anterior watershed: ACA–MCA cortical border zone", f:"WS", sh:["w",345,8], clip:"ctx"},
    {id:"lsa", n:"Lateral lenticulostriate arteries (M1 MCA): putamen, globus pallidus externa, upper capsule", f:"MCAd", sh:["e",196,260,30,48]},
    {id:"heub", n:"Recurrent artery of Heubner (A1–A2 junction): caudate head, anterior limb, anterior putamen", f:"ACAd", sh:["e",238,236,22,40]},
    {id:"mlsa", n:"Medial lenticulostriate arteries (A1): accumbens, anterior hypothalamus, basal forebrain", f:"ACAd", sh:["e",246,300,22,16]},
    {id:"acha", n:"Anterior choroidal artery (ICA): amygdala, uncus", f:"AChA", sh:["e",214,372,20,16]},
    {id:"acom", n:"Anterior communicating artery perforators: septum, fornix columns, anterior hypothalamus", f:"ACAd", sh:["e",290,290,12,40]},
    {id:"shy", n:"Superior hypophyseal arteries (ICA): optic chiasm", f:"ICA", sh:["e",290,348,12,8]}
  ],
  syn:[
    {n:"Recurrent artery of Heubner syndrome", need:[["cau"],["alic"]], t:"Opposite face and arm weakness, dysarthria and abulia from the caudate head and anterior limb."},
    {n:"Caudate (abulic) syndrome", need:[["cau"]], not:["alic"], t:"Abulia, apathy or disinhibition, sometimes hemichorea, with little weakness."},
    {n:"Broca aphasia", only:"L", need:[["ifg"]], t:"Nonfluent, effortful speech with apraxia of speech; MCA superior division."},
    {n:"Transcortical motor aphasia", only:"L", need:[["sfg"]], t:"Sparse speech with preserved repetition; ACA territory or ACA–MCA watershed."},
    {n:"Akinetic mutism", bi:[["cing","sfg"]], t:"Bilateral medial frontal damage: awake but no spontaneous speech or movement (bilateral ACA, often from one azygos or a vasospasm)."},
    {n:"Basal forebrain / septal amnesia", need:[["bf","sept","fx"]], t:"Amnesia with confabulation after anterior communicating artery aneurysm rupture or clipping."},
    {n:"Klüver–Bucy syndrome", bi:[["amyg"]], t:"Bilateral amygdala and anterior temporal damage."},
    {n:"Chiasmal syndrome", need:[["och"]], t:"Bitemporal hemianopia."},
    {n:"Hypothalamic syndrome", need:[["hy"]], t:"Temperature dysregulation, sleep disturbance, diabetes insipidus."}
  ],
  presets:[
    {n:"Right Heubner (caudate head and anterior limb)", sh:[["e",236,230,16,26]]},
    {n:"Left inferior frontal gyrus (Broca)", sh:[["e",512,184,18,16]]},
    {n:"Basal forebrain and septum (ACoA)", sh:[["e",300,300,24,30]]}
  ]
});

/* ---------------- Coronal · posterior ---------------- */
S.push({
  id:"cor-p", group:"Cerebrum", name:"Coronal · posterior (splenium)", w:600, h:560, center:[196,240],
  view:"Coronal, through the splenium, atrium and parietal lobes · top of the head up",
  outline:"M300,44 C420,40 534,120 540,250 C546,350 500,410 430,420 C400,424 370,420 340,412 L300,410 L260,412 C230,420 200,424 170,420 C100,410 54,350 60,250 C66,120 180,40 300,44 Z M300,428 C350,428 420,436 450,458 C480,482 470,526 420,538 C370,550 330,546 300,542 C270,546 230,550 180,538 C130,526 120,482 150,458 C180,436 250,428 300,428 Z",
  hemi:"M298,46 C180,44 62,120 62,250 C58,350 102,410 170,420 C200,424 230,420 260,412 L298,410 Z",
  inner:"M290,88 C196,90 104,150 102,250 C100,330 136,374 184,380 C214,384 244,378 268,372 L298,370 Z",
  structs:[
    {id:"wmp", n:"Parietal white matter (SLF, arcuate fasciculus)", a:"P-WM", k:"wm", sh:["w",260,90], clip:"wm", fn:"Parieto-frontal and parieto-temporal association fibers", d:[["{C} neglect","contra","R"],["Conduction aphasia, ideomotor apraxia","bi","L"]]},
    {id:"wmo", n:"Temporo-occipital white matter (inferior longitudinal fasciculus)", a:"TO-WM", k:"wm", sh:["w",150,260], clip:"wm", fn:"Ventral visual stream", d:[["Visual agnosia when both sides are involved","bi"]]},
    {id:"pcun", n:"Precuneus and posterior cingulate (medial parietal)", a:"PCun", k:"ctx", sh:["w",30,95], clip:"ctx", fn:"Visuospatial imagery, episodic memory retrieval", d:[["Topographical disorientation","bi"]]},
    {id:"spl", n:"Superior parietal lobule", a:"SPL", k:"ctx", sh:["w",330,30], clip:"ctx", fn:"Reaching, body schema", d:[["{C} optic ataxia","contra"],["{C} cortical sensory loss","contra"]]},
    {id:"ipl", n:"Inferior parietal lobule (supramarginal and angular gyri)", a:"IPL", k:"ctx", sh:["w",260,330], clip:"ctx", fn:"Language, calculation, praxis (left); spatial attention (right)", d:[["Gerstmann syndrome, alexia with agraphia, conduction aphasia, ideomotor apraxia","bi","L"],["{C} hemispatial neglect, anosognosia, dressing and constructional apraxia","contra","R"]]},
    {id:"pmtg", n:"Posterior middle and inferior temporal gyri (MT/V5)", a:"MT", k:"ctx", sh:["w",200,260], clip:"ctx", fn:"Visual motion, smooth pursuit", d:[["Impaired pursuit toward the {I} side","ipsi"],["Anomia","bi","L"]]},
    {id:"fus", n:"Posterior fusiform and parahippocampal gyri", a:"Fus", k:"ctx", sh:["w",150,200], clip:"ctx", fn:"Faces, words, scenes", d:[["Prosopagnosia","bi","R"],["Pure alexia","bi","L"],["Topographic agnosia","bi"]]},
    {id:"rsp", n:"Retrosplenial cortex and cingulate isthmus", a:"RSp", k:"ctx", sh:["w",95,150], clip:"ctx", fn:"Memory and navigation", d:[["Retrosplenial amnesia and topographic disorientation","bi"]]},
    {id:"arc", n:"Arcuate fasciculus", a:"AF", k:"tract", sh:["e",158,250,12,30], fn:"Links Wernicke and Broca areas", d:[["Conduction aphasia","bi","L"],["{C} neglect","contra","R"]]},
    {id:"or", n:"Optic radiation (sagittal stratum, lateral wall of the atrium)", a:"OR", k:"tract", sh:["p","M212,246 L226,250 L216,320 L202,316 Z"], fn:"LGN to calcarine cortex", d:[D.hemianopia]},
    {id:"atr", n:"Lateral ventricle, atrium", a:"Atr", k:"csf", sh:["e",252,266,24,22], d:[]},
    {id:"chp", n:"Choroid plexus (glomus)", a:"ChP", k:"nuc", sh:["e",252,268,10,8], fn:"CSF production", d:[["Calcifies normally; intraventricular hemorrhage source","bi"]]},
    {id:"fxc", n:"Crus of the fornix", a:"Fx", k:"tract", sh:["e",264,244,8,5], fn:"Hippocampal output", d:[["Anterograde amnesia","bi"]]},
    {id:"hipt", n:"Hippocampal tail", a:"Hip", k:"ctx", sh:["e",236,300,13,8], fn:"Episodic memory", d:[D.amnesia]},
    {id:"ccs", n:"Corpus callosum, splenium", a:"CCs", k:"tract", s:"M", sh:["p","M232,224 C262,206 338,206 368,224 L360,244 C334,228 266,228 240,244 Z"], fn:"Connects parietal and occipital lobes", d:[["Left visual field anomia; alexia without agraphia with a left occipital lesion","bi"]]},
    {id:"cbs", n:"Cerebellar hemisphere (superior)", a:"Cb", k:"ctx", sh:["r",0,428,300,140], clip:"out", fn:"Limb coordination", d:[D.ataxI,["Dysarthria","bi"]]},
    {id:"verm", n:"Cerebellar vermis (superior and posterior)", a:"Verm", k:"ctx", s:"M", sh:["e",300,480,20,44], fn:"Gait and eye movements", d:[["Gait and truncal ataxia, nystagmus","bi"]]}
  ],
  terr:[
    {id:"mcas", n:"MCA superior division (M4): posterior parietal branches", f:"MCA", sh:["w",290,15]},
    {id:"mcai", n:"MCA inferior division (M4): angular and posterior temporal branches", f:"MCA", sh:["w",225,290]},
    {id:"aca", n:"ACA (A4): pericallosal precuneal branches", f:"ACA", sh:["w",15,80]},
    {id:"pca", n:"PCA (P3–P4): parieto-occipital, posterior temporal and hippocampal branches", f:"PCA", sh:["w",80,225]},
    {id:"wsa", n:"ACA–MCA cortical border zone (posterior parasagittal)", f:"WS", sh:["w",8,24], clip:"ctx"},
    {id:"wsp", n:"Posterior watershed: MCA–PCA cortical border zone", f:"WS", sh:["w",215,235], clip:"ctx"},
    {id:"spl", n:"Posterior pericallosal (splenial) artery (PCA)", f:"PCA", sh:["e",282,224,22,14]},
    {id:"chp", n:"Lateral posterior choroidal artery (P2) and anterior choroidal artery: atrial choroid plexus", f:"PCAd", sh:["e",252,266,14,12]},
    {id:"sca", n:"Superior cerebellar artery: superior hemisphere and vermis", f:"SCA", sh:["r",0,428,300,140], clip:"out"}
  ],
  syn:[
    {n:"Gerstmann syndrome", only:"L", need:[["ipl"]], t:"Agraphia, acalculia, finger agnosia, left-right confusion; dominant angular gyrus (MCA inferior division)."},
    {n:"Hemispatial neglect syndrome", only:"R", need:[["ipl","spl","arc"]], t:"Left neglect, anosognosia, dressing and constructional apraxia from right parietal damage."},
    {n:"Balint syndrome", bi:[["spl","ipl"]], t:"Optic ataxia, oculomotor apraxia and simultanagnosia; bilateral posterior watershed infarcts or posterior cortical atrophy."},
    {n:"Alexia without agraphia", only:"L", need:[["ccs"],["or","fus","rsp"]], t:"Left PCA infarct of the occipital lobe and splenium: reads poorly, writes normally."},
    {n:"Retrosplenial amnesia", need:[["rsp"]], t:"Anterograde amnesia and getting lost after retrosplenial damage; often left PCA or hemorrhage."},
    {n:"Prosopagnosia", only:"R", need:[["fus"]], t:"Face recognition failure from right posterior fusiform damage."},
    {n:"Optic radiation hemianopia", need:[["or"]], t:"Opposite homonymous hemianopia; parietal radiation lesions favour the lower quadrant."},
    {n:"Superior cerebellar (SCA) infarct", need:[["cbs"]], t:"Same-side limb ataxia and dysarthria; watch for swelling and hydrocephalus."}
  ],
  presets:[
    {n:"Left inferior parietal lobule", sh:[["e",514,200,18,18]]},
    {n:"Left splenium and occipital radiation", sh:[["p","M296,214 L330,214 L392,250 L398,320 L376,326 L360,246 L296,236 Z"]]},
    {n:"Right superior cerebellum (SCA)", sh:[["e",190,476,50,30]]}
  ]
});

/* ---------------- Axial · posterior fossa ---------------- */
S.push({
  id:"ax-pf", group:"Posterior fossa", name:"Axial · posterior fossa (pons and cerebellum)", w:600, h:520,
  view:"Axial, at the midpons and middle cerebellar peduncles · front at the top",
  outline:"M300,96 C350,96 392,110 410,140 C440,130 486,150 512,196 C540,248 540,330 504,384 C468,436 392,462 300,464 C208,462 132,436 96,384 C60,330 60,248 88,196 C114,150 160,130 190,140 C208,110 250,96 300,96 Z",
  structs:[
    {id:"cbh", n:"Cerebellar hemisphere (posterior lobe: Crus I and II, lobules VI–VIII)", a:"CbH", k:"ctx", sh:["r",0,0,300,520], clip:"out", fn:"Limb coordination; cognition (Crus I/II)", d:[D.ataxI,["{I} intention tremor and dysdiadochokinesia","ipsi"],["Dysarthria","bi"],["Executive and visuospatial problems (cerebellar cognitive affective syndrome)","bi"]]},
    {id:"floc", n:"Flocculus and paraflocculus", a:"Floc", k:"ctx", sh:["e",156,214,18,11], fn:"Gaze holding, pursuit, VOR suppression", d:[["Downbeat and gaze-evoked nystagmus, broken pursuit","bi"],["Imbalance","ipsi"]]},
    {id:"mcp", n:"Middle cerebellar peduncle", a:"MCP", k:"tract", sh:["p","M226,170 L176,186 L168,252 L214,264 L242,228 Z"], fn:"Pontocerebellar input", d:[D.ataxI]},
    {id:"vroot", n:"Trigeminal nerve root (cerebellopontine angle)", a:"V", k:"tract", sh:["p","M206,174 L150,162 L146,176 L204,188 Z"], fn:"Facial sensation and chewing", d:[["{I} facial numbness and weak chewing","ipsi"]]},
    {id:"dent", n:"Dentate nucleus", a:"Dent", k:"nuc", sh:["p","M190,312 Q198,298 212,306 Q226,296 236,310 Q244,324 232,332 Q220,342 208,332 Q196,340 190,326 Q184,318 190,312 Z"], fn:"Cerebellar output to the opposite thalamus and red nucleus", d:[["{I} intention tremor, dysmetria","ipsi"]]},
    {id:"intp", n:"Interposed nuclei (emboliform and globose)", a:"Int", k:"nuc", sh:["c",250,304,6], fn:"Output to red nucleus", d:[D.ataxI]},
    {id:"fast", n:"Fastigial nucleus", a:"Fast", k:"nuc", sh:["c",278,300,5], fn:"Vestibular and saccade control", d:[["Truncal ataxia, saccadic overshoot","bi"]]},
    {id:"scp", n:"Superior cerebellar peduncle (lateral wall of the fourth ventricle)", a:"SCP", k:"tract", sh:["e",262,284,10,14], fn:"Cerebellar output before its crossing", d:[["{I} ataxia and intention tremor","ipsi"]]},
    {id:"pbas", n:"Basis pontis (corticospinal tract, pontine nuclei)", a:"BP", k:"tract", sh:["p","M300,108 C250,108 214,124 204,156 C200,180 214,204 240,214 L300,218 Z"], fn:"Descending motor fibers and pontocerebellar relay", d:[D.wkFAL,D.ataxC,["Dysarthria","bi"]]},
    {id:"pteg", n:"Pontine tegmentum (cranial nerve nuclei, lemnisci, MLF, PPRF)", a:"PT", k:"nuc", sh:["p","M300,218 L240,214 C232,232 238,254 252,266 L300,270 Z"], fn:"Gaze centers, trigeminal nuclei, sensory tracts, arousal", d:[["Horizontal gaze palsy or INO toward the {I} side","ipsi"],["{C} hemisensory loss","contra"],["{I} facial numbness","ipsi"],["Coma if both sides","bi","BOTH"]]},
    {id:"v4", n:"Fourth ventricle", a:"4V", k:"csf", s:"M", sh:["p","M276,272 L324,272 L314,300 L286,300 Z"], d:[["Compression causes obstructive hydrocephalus","bi"]]},
    {id:"nod", n:"Nodulus and uvula", a:"Nod", k:"ctx", s:"M", sh:["e",300,316,12,8], fn:"Velocity storage, tilt processing", d:[["Truncal ataxia, positional and periodic alternating nystagmus","bi"]]},
    {id:"verm", n:"Vermis (declive, folium, tuber: oculomotor vermis)", a:"Verm", k:"ctx", s:"M", sh:["e",300,384,22,46], fn:"Gait, posture, saccade accuracy", d:[["Gait and truncal ataxia, saccadic dysmetria","bi"]]}
  ],
  terr:[
    {id:"sca", n:"Superior cerebellar artery (lateral branch): superolateral hemisphere, dentate nucleus, superior peduncle", f:"SCA", sh:["r",0,0,300,520], clip:"out"},
    {id:"aica", n:"AICA: middle cerebellar peduncle, flocculus, anterior inferior hemisphere, trigeminal root zone", f:"AICA", sh:["p","M240,214 L204,150 L150,160 L96,220 L112,292 L200,270 Z"], clip:"out"},
    {id:"pica", n:"PICA (medial branch): inferior vermis, nodulus, medial posterior hemisphere", f:"PICA", sh:["p","M300,306 L250,330 L200,400 L230,470 L300,470 Z"], clip:"out"},
    {id:"bcirc", n:"Short and long circumferential branches of the basilar artery: lateral pons", f:"BA", sh:["p","M264,104 L210,118 L198,170 L236,216 L256,218 L258,270 L244,270 L230,214 Z"], clip:"out"},
    {id:"bpara", n:"Paramedian (pontine perforating) branches of the basilar artery", f:"BA", sh:["p","M300,104 L264,106 L256,218 L266,270 L300,272 Z"]}
  ],
  syn:[
    {n:"Cerebellar hemisphere syndrome", need:[["cbh","dent"]], t:"Same-side limb ataxia, intention tremor and dysdiadochokinesia, often vertigo and vomiting. Large infarcts and bleeds can swell and compress the fourth ventricle and brainstem: watch for falling consciousness."},
    {n:"Midline (vermian) cerebellar syndrome", need:[["verm","nod","fast"]], t:"Truncal and gait ataxia with nystagmus and little limb ataxia; medial PICA or SCA branch, medulloblastoma, alcohol."},
    {n:"AICA cerebellar syndrome", need:[["mcp","floc"]], t:"Same-side ataxia, vertigo and nystagmus; with pontine and labyrinthine involvement, deafness and facial palsy."},
    {n:"Ventral pontine syndrome", need:[["pbas"]], t:"Opposite hemiparesis with ataxia and dysarthria; paramedian basilar branches."},
    {n:"Locked-in syndrome", bi:[["pbas"]], t:"Bilateral basis pontis infarction from basilar thrombosis."},
    {n:"Cerebellopontine angle syndrome", need:[["vroot"],["mcp","floc"]], t:"Facial numbness, ataxia and nystagmus (with hearing loss and facial palsy at lower levels); vestibular schwannoma, meningioma or AICA infarct."}
  ],
  presets:[
    {n:"Right cerebellar hemisphere", sh:[["e",150,360,48,50]]},
    {n:"Vermis (midline)", sh:[["e",300,382,22,44]]},
    {n:"Left middle cerebellar peduncle (AICA)", sh:[["e",402,222,26,22]]},
    {n:"Bilateral ventral pons", sh:[["e",300,160,60,40]]}
  ]
});

/* rename the original coronal slice and put the slices in anatomical order */
const cor = S.find(s => s.id === "cor"); if (cor) cor.name = "Coronal · mid-thalamus";
const ORDER = ["ax-vx", "ax-cr", "ax-bg", "ax-ml", "cor-a", "cor", "cor-p", "sag", "ax-pf"];
const rank = id => { const i = ORDER.indexOf(id); return i < 0 ? 99 : i; };
const sorted = S.slice().sort((a, b) => rank(a.id) - rank(b.id));
S.length = 0; sorted.forEach(s => S.push(s));
})();
