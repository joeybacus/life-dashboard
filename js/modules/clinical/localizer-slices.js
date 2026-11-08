/* Neuro Localizer: slice anatomy, arterial territories and syndrome rules.
   Coordinates are in each slice's own units. Every slice is drawn with the patient's right on the
   viewer's left (as on CT and MRI). Structures with s:"R" are drawn once, on the viewer's left,
   and mirrored automatically for the left side; s:"M" structures sit on the midline.
   Shapes: ["e",cx,cy,rx,ry,rot] ellipse · ["c",cx,cy,r] circle · ["r",x,y,w,h] rect ·
           ["p","M… L… C… Z"] path (absolute M/L/C/Q/Z only) · ["w",a1,a2] wedge from the slice centre,
           angle 0 = top of the drawing, 90 = toward the midline … measured for the right side.
   clip: "ctx" cortex band · "wm" white matter core · "out" inside the outline, own half · in:"id" inside another structure.
   Deficits: [text, lat, only]; {C} = side opposite the lesion, {I} = same side; lat "contra" | "ipsi" | "bi";
   only "L" or "R" limits a line to a lesion on that side (language is assumed to be left-dominant). */
(function () {
const D = {
  wkFAL: ["{C} face, arm and leg weakness (upper motor neuron)", "contra"],
  wkAL: ["{C} arm and leg weakness (upper motor neuron)", "contra"],
  wkALnoFace: ["{C} arm and leg weakness, face spared", "contra"],
  dys: ["Dysarthria", "bi"],
  face: ["{C} lower face and tongue weakness", "contra"],
  hemisens: ["{C} hemisensory loss", "contra"],
  ml: ["{C} loss of vibration and position sense", "contra"],
  stt: ["{C} loss of pain and temperature", "contra"],
  sttFace: ["{C} loss of pain and temperature in the body (and face, above the pons)", "contra"],
  mlf: ["{I} internuclear ophthalmoplegia (weak adduction of the {I} eye)", "ipsi"],
  horner: ["{I} Horner syndrome (ptosis, miosis)", "ipsi"],
  ctt: ["Delayed palatal tremor (hypertrophic olivary degeneration)", "bi"],
  hemianopia: ["{C} homonymous hemianopia", "contra"],
  ataxI: ["{I} limb ataxia", "ipsi"],
  ataxC: ["{C} limb ataxia", "contra"],
  coma: ["Reduced consciousness (the arousal system is involved on both sides)", "bi", "BOTH"],
  pprf: ["Horizontal gaze palsy toward the {I} side", "ipsi"],
  csf: []
};

const AX = "M300,28 C430,28 528,140 532,300 C536,470 450,620 300,628 C150,620 64,470 68,300 C72,140 170,28 300,28 Z";
const AXH = "M298,30 C176,34 74,140 70,300 C66,470 150,616 298,626 Z";
const AXI = "M262,84 C190,90 124,170 120,300 C116,440 176,552 262,566 Z";

const S = [];

/* ---------------- Axial · corona radiata ---------------- */
S.push({
  id:"ax-cr", group:"Cerebrum", name:"Axial · corona radiata", w:600, h:660, center:[196,320],
  view:"Axial, at the bodies of the lateral ventricles · front at the top", outline:AX, hemi:AXH, inner:AXI,
  structs:[
    {id:"wmF", n:"Frontal white matter", a:"F-WM", k:"wm", sh:["w",300,100], clip:"wm", fn:"Frontostriatal, frontothalamic and premotor connections", d:[["Apathy, slowed thinking, executive dysfunction","bi"]]},
    {id:"wmP", n:"Parietal white matter", a:"P-WM", k:"wm", sh:["w",100,300], clip:"wm", fn:"Parietal association fibers", d:[["{C} cortical-type sensory loss","contra"],["{C} hemispatial neglect","contra","R"],["Ideomotor apraxia","bi","L"]]},
    {id:"sma", n:"Supplementary motor area and medial superior frontal gyrus", a:"SMA", k:"ctx", sh:["w",20,85], clip:"ctx", fn:"Starting and sequencing movement", d:[["{C} leg-predominant weakness and akinesia","contra"],["Transcortical motor aphasia (sparse speech, repetition preserved)","bi","L"],["Alien hand (with callosal involvement)","contra"]]},
    {id:"pfc", n:"Prefrontal convexity (superior and middle frontal gyri)", a:"PFC", k:"ctx", sh:["w",330,20], clip:"ctx", fn:"Executive control, working memory; frontal eye field in the posterior middle frontal gyrus", d:[["Dysexecutive syndrome: poor planning, set-shifting and working memory","bi"],["Eyes deviate toward the {I} side acutely (frontal eye field)","ipsi"]]},
    {id:"m1", n:"Precentral gyrus (primary motor: hand and arm)", a:"M1", k:"ctx", sh:["w",285,330], clip:"ctx", fn:"Voluntary movement, hand and arm at this level", d:[["{C} hand and arm weakness, leg spared","contra"]]},
    {id:"s1", n:"Postcentral gyrus (primary somatosensory: hand and arm)", a:"S1", k:"ctx", sh:["w",258,285], clip:"ctx", fn:"Touch, position and discriminative sensation", d:[["{C} loss of position sense, two-point discrimination and stereognosis in the hand","contra"]]},
    {id:"smg", n:"Supramarginal gyrus", a:"SMG", k:"ctx", sh:["w",228,258], clip:"ctx", fn:"Phonological processing (left); spatial attention (right)", d:[["Conduction aphasia","bi","L"],["Ideomotor apraxia","bi","L"],["{C} neglect and anosognosia","contra","R"],["{C} sensory extinction","contra"]]},
    {id:"ang", n:"Angular gyrus", a:"AG", k:"ctx", sh:["w",198,228], clip:"ctx", fn:"Reading, writing, calculation (left); spatial attention (right)", d:[["Gerstmann syndrome: agraphia, acalculia, finger agnosia, left-right confusion","bi","L"],["Alexia with agraphia; anomia","bi","L"],["{C} hemispatial neglect","contra","R"]]},
    {id:"spl", n:"Superior parietal lobule", a:"SPL", k:"ctx", sh:["w",150,198], clip:"ctx", fn:"Visually guided reaching, body schema", d:[["{C} optic ataxia (misreaching under visual guidance)","contra"],["{C} cortical sensory loss","contra"]]},
    {id:"pcun", n:"Precuneus and posterior medial parietal cortex", a:"PCun", k:"ctx", sh:["w",100,150], clip:"ctx", fn:"Spatial imagery, self-referential processing", d:[["Topographical disorientation, impaired visual imagery","bi"]]},
    {id:"lv", n:"Lateral ventricle (body)", a:"LV", k:"csf", sh:["e",276,322,12,82,-3], d:[]},
    {id:"cau", n:"Caudate body", a:"Cd", k:"nuc", sh:["e",258,300,7,44,-5], fn:"Associative and limbic loops of the basal ganglia", d:[["Abulia, apathy, executive dysfunction","bi"],["{C} chorea (rare)","contra"]]},
    {id:"crm", n:"Corona radiata: motor fibers (corticospinal and corticobulbar)", a:"CR-m", k:"tract", sh:["e",226,304,17,40,-6], fn:"Descending motor fibers: face anterolateral, arm, leg posteromedial", d:[D.wkFAL,D.dys]},
    {id:"crs", n:"Corona radiata: sensory radiation (thalamocortical)", a:"CR-s", k:"tract", sh:["e",228,372,15,22,-6], fn:"Ascending fibers from VPL and VPM to the postcentral gyrus", d:[D.hemisens]},
    {id:"slf", n:"Superior longitudinal and arcuate fasciculus", a:"SLF", k:"tract", sh:["e",170,322,13,52,-4], fn:"Links frontal, parietal and temporal language and attention areas", d:[["Conduction aphasia (poor repetition)","bi","L"],["{C} hemispatial neglect","contra","R"],["Ideomotor apraxia","bi","L"]]}
  ],
  terr:[
    {id:"mcas", n:"MCA superior division (M2–M4): prerolandic, rolandic and anterior parietal branches", f:"MCA", sh:["w",230,15]},
    {id:"mcai", n:"MCA inferior division (M2–M4): angular and posterior parietal branches", f:"MCA", sh:["w",175,230]},
    {id:"aca", n:"ACA (A2–A4): callosomarginal and pericallosal branches", f:"ACA", sh:["w",15,135]},
    {id:"pca", n:"PCA (P4): parieto-occipital branch", f:"PCA", sh:["w",135,175]},
    {id:"wsa", n:"Anterior watershed: ACA–MCA cortical border zone", f:"WS", sh:["w",6,24], clip:"ctx"},
    {id:"wsp", n:"Posterior watershed: MCA–PCA cortical border zone", f:"WS", sh:["w",165,183], clip:"ctx"},
    {id:"ibz", n:"MCA medullary (superficial perforating) arteries; a chain of lesions here is the internal border zone", f:"MCAd", sh:["e",230,326,28,78,-5]},
    {id:"lsa", n:"Lateral lenticulostriate arteries (M1 MCA)", f:"MCAd", sh:["e",258,300,12,50,-5]}
  ],
  syn:[
    {n:"Pure motor hemiparesis (lacunar, corona radiata)", need:[["crm"]], not:["m1","s1","smg","ang","spl","sma","pfc","crs","slf"], t:"Face, arm and leg weakness without sensory, visual or cognitive signs. Small vessel disease of the deep perforators."},
    {n:"Gerstmann syndrome", only:"L", need:[["ang"]], t:"Agraphia, acalculia, finger agnosia and left-right confusion from the dominant angular gyrus."},
    {n:"Conduction aphasia", only:"L", need:[["smg","slf"]], t:"Fluent speech and good comprehension with poor repetition and phonemic paraphasias."},
    {n:"Hemispatial neglect syndrome", only:"R", need:[["smg","ang","slf","spl"]], t:"Neglect of the left side of space and body, often with anosognosia, from right parietal damage."},
    {n:"Balint syndrome", bi:[["spl","ang"]], t:"Optic ataxia, oculomotor apraxia and simultanagnosia from bilateral parieto-occipital damage, often watershed."},
    {n:"Anterior cerebral artery syndrome (medial frontal)", need:[["sma"]], t:"Leg-predominant weakness, abulia, urinary incontinence; transcortical motor aphasia if dominant."}
  ],
  presets:[
    {n:"Left corona radiata lacune", sh:[["e",374,306,10,13]]},
    {n:"Left angular gyrus infarct", sh:[["e",490,452,26,22]]},
    {n:"Right internal border zone chain", sh:[["e",230,300,9,9],["e",232,330,9,9],["e",236,360,9,9]]}
  ]
});

/* ---------------- Axial · basal ganglia and thalamus ---------------- */
S.push({
  id:"ax-bg", group:"Cerebrum", name:"Axial · basal ganglia and thalamus", w:600, h:660, center:[190,332],
  view:"Axial, through the internal capsule and thalamus · front at the top", outline:"M53.7,345.5 L53.7,410.9 L64.1,438.5 L64.1,455.7 L84.7,500.5 L98.5,514.3 L105.4,534.9 L122.6,559.1 L165.7,598.7 L207.0,626.2 L241.4,640.0 L269.0,640.0 L272.4,636.6 L279.3,636.6 L296.6,615.9 L303.4,615.9 L320.7,636.6 L327.6,636.6 L331.0,640.0 L358.6,640.0 L393.0,626.2 L434.3,598.7 L477.4,559.1 L494.6,534.9 L501.5,514.3 L515.3,500.5 L532.5,466.1 L532.5,459.2 L535.9,455.7 L535.9,438.5 L546.3,410.9 L546.3,345.5 L535.9,321.4 L535.9,293.8 L525.6,266.3 L525.6,249.1 L515.3,231.8 L515.3,214.6 L508.4,204.3 L508.4,176.7 L498.1,149.2 L480.8,128.5 L467.1,94.1 L448.1,71.7 L427.4,57.9 L420.6,57.9 L393.0,33.8 L386.1,33.8 L372.3,26.9 L358.6,26.9 L355.1,23.4 L337.9,23.4 L334.4,20.0 L317.2,26.9 L300.0,40.7 L282.8,26.9 L265.6,20.0 L262.1,23.4 L227.7,26.9 L224.2,30.3 L207.0,33.8 L179.4,57.9 L165.7,61.3 L150.2,73.4 L150.2,76.8 L132.9,94.1 L119.2,128.5 L98.5,156.1 L95.1,173.3 L91.6,176.7 L91.6,204.3 L84.7,214.6 L84.7,231.8 L74.4,249.1 L74.4,266.3 L64.1,293.8 L64.1,321.4 Z", hemi:"M53.7,345.5 L53.7,410.9 L64.1,438.5 L64.1,455.7 L84.7,500.5 L98.5,514.3 L105.4,534.9 L122.6,559.1 L165.7,598.7 L220.8,633.1 L227.7,633.1 L241.4,640.0 L269.0,640.0 L272.4,636.6 L279.3,636.6 L298.3,614.2 L296.6,37.2 L282.8,26.9 L265.6,20.0 L262.1,23.4 L244.9,23.4 L241.4,26.9 L227.7,26.9 L224.2,30.3 L207.0,33.8 L179.4,57.9 L172.6,57.9 L151.9,71.7 L132.9,94.1 L126.1,107.8 L126.1,114.7 L112.3,138.8 L101.9,149.2 L91.6,176.7 L91.6,204.3 L84.7,214.6 L84.7,231.8 L74.4,249.1 L74.4,266.3 L64.1,293.8 L64.1,321.4 Z", inner:"M64.1,352.4 L67.5,400.6 L79.6,412.7 L83.0,409.2 L103.7,409.2 L108.8,421.3 L108.8,435.1 L81.3,459.2 L84.7,469.5 L100.2,485.0 L131.2,481.6 L146.7,503.9 L145.0,509.1 L127.8,516.0 L115.7,528.1 L119.2,534.9 L134.7,547.0 L148.4,533.2 L162.2,529.8 L174.3,541.8 L174.3,548.7 L167.4,555.6 L160.5,576.3 L176.0,591.8 L186.3,591.8 L203.6,581.4 L212.2,590.1 L208.7,603.8 L220.8,615.9 L231.1,605.6 L251.8,633.1 L265.6,633.1 L291.4,600.4 L291.4,579.7 L269.0,553.9 L258.7,564.2 L246.6,552.2 L250.1,541.8 L246.6,538.4 L246.6,472.9 L274.2,445.4 L270.7,431.6 L282.8,419.6 L298.3,417.8 L298.3,169.8 L277.6,156.1 L281.1,145.7 L269.0,133.7 L258.7,133.7 L246.6,121.6 L246.6,114.7 L263.8,97.5 L260.4,83.7 L284.5,63.1 L281.1,45.8 L269.0,33.8 L262.1,30.3 L251.8,33.8 L239.7,45.8 L243.2,52.7 L234.6,61.3 L213.9,44.1 L198.4,59.6 L198.4,90.6 L201.8,97.5 L196.7,102.7 L188.1,100.9 L169.1,75.1 L139.8,104.4 L155.3,123.3 L169.1,126.8 L170.8,131.9 L158.8,150.9 L124.3,144.0 L112.3,156.1 L108.8,166.4 L139.8,193.9 L139.8,204.3 L119.2,224.9 L129.5,235.3 L129.5,249.1 L108.8,266.3 L119.2,276.6 L112.3,300.7 L108.8,338.6 L103.7,350.7 L76.1,340.3 Z",
  structs:[
    {id:"wmF", n:"Frontal white matter", a:"F-WM", k:"wm", sh:["w",300,110], clip:"wm", fn:"Frontal connections to striatum, thalamus and other lobes", d:[["Apathy, executive dysfunction","bi"]]},
    {id:"wmT", n:"Temporal white matter (temporal stem)", a:"T-WM", k:"wm", sh:["w",230,300], clip:"wm", fn:"Uncinate, inferior fronto-occipital fasciculus, Meyer loop, auditory radiation", d:[["{C} superior quadrantanopia (Meyer loop)","contra"],["Semantic and comprehension deficits","bi","L"]]},
    {id:"wmO", n:"Occipital white matter", a:"O-WM", k:"wm", sh:["w",110,230], clip:"wm", fn:"Optic radiation, inferior longitudinal fasciculus", d:[D.hemianopia,["Visual object agnosia when both sides are involved","bi"]]},
    {id:"ofc", n:"Frontal pole and orbitofrontal cortex", a:"OFC", k:"ctx", sh:["w",335,30], clip:"ctx", fn:"Social behaviour, reward, decision-making", d:[["Disinhibition, impulsivity, poor social judgment (orbitofrontal syndrome)","bi"]]},
    {id:"acc", n:"Medial prefrontal and anterior cingulate cortex", a:"ACC", k:"ctx", sh:["w",30,95], clip:"ctx", fn:"Motivation, initiation, error monitoring", d:[["Apathy, abulia, reduced spontaneous speech and movement","bi"],["Akinetic mutism if both sides","bi"],["Urinary incontinence","bi"]]},
    {id:"ifg", n:"Inferior frontal gyrus (pars opercularis and triangularis)", a:"IFG", k:"ctx", sh:["w",295,335], clip:"ctx", fn:"Speech production (left, Broca area); prosody (right)", d:[["Broca (nonfluent) aphasia with apraxia of speech","bi","L"],["Expressive aprosodia","bi","R"],["{C} lower face and arm weakness (adjacent opercular motor cortex)","contra"]]},
    {id:"hes", n:"Heschl gyrus and anterior superior temporal gyrus", a:"STG", k:"ctx", sh:["w",258,295], clip:"ctx", fn:"Primary auditory cortex", d:[["Hearing preserved (each ear projects to both sides)","bi"],["Pure word deafness (with left or bilateral lesions)","bi","L"],["Receptive aprosodia","bi","R"]]},
    {id:"wer", n:"Posterior superior temporal gyrus (Wernicke area)", a:"W", k:"ctx", sh:["w",230,258], clip:"ctx", fn:"Language comprehension (left)", d:[["Wernicke (fluent) aphasia: poor comprehension and repetition, paraphasias","bi","L"],["Receptive aprosodia, confusional state","bi","R"]]},
    {id:"mt", n:"Temporo-occipital junction (MT/V5)", a:"MT", k:"ctx", sh:["w",205,230], clip:"ctx", fn:"Visual motion, smooth pursuit", d:[["Impaired smooth pursuit toward the {I} side","ipsi"],["Akinetopsia (motion blindness) if both sides","bi"]]},
    {id:"loc", n:"Lateral occipital cortex", a:"LO", k:"ctx", sh:["w",180,205], clip:"ctx", fn:"Object form", d:[["Visual object agnosia when both sides are involved","bi"],["{C} homonymous field defect","contra"]]},
    {id:"v1", n:"Medial occipital cortex: calcarine (V1)", a:"V1", k:"ctx", sh:["w",125,180], clip:"ctx", fn:"Primary visual cortex", d:[["{C} homonymous hemianopia, congruous, often macular sparing","contra"],["Cortical blindness if both sides; sometimes Anton syndrome (denial)","bi"]]},
    {id:"rsp", n:"Retrosplenial and posterior cingulate cortex", a:"RSp", k:"ctx", sh:["w",95,125], clip:"ctx", fn:"Memory, navigation", d:[["Anterograde amnesia and topographic disorientation","bi"]]},
    {id:"ins", n:"Insular cortex", a:"Ins", k:"ctx", sh:["p","M189.8,187.1 L179.4,214.6 L176.0,249.1 L175.3,283.5 L177.4,314.5 L182.9,342.1 L193.2,362.7 L182.9,371.3 L165.7,348.9 L156.7,314.5 L153.3,283.5 L154.6,252.5 L158.8,221.5 L172.6,187.1 Z"], fn:"Interoception, taste, autonomic control, speech planning", d:[["Apraxia of speech (left anterior insula)","bi","L"],["Autonomic instability, arrhythmia","bi","R"],["Taste disturbance","bi"]]},
    {id:"ext", n:"External and extreme capsules, claustrum", a:"EC", k:"wm", sh:["p","M224.2,197.4 L207.0,214.6 L193.2,242.2 L183.6,269.7 L182.9,290.4 L185.6,317.9 L193.2,342.1 L205.3,355.8 L217.3,345.5 L220.8,307.6 L224.2,273.2 L222.5,238.7 Z"], fn:"Corticocortical and claustral connections", d:[["Often silent","bi"]]},
    {id:"put", n:"Putamen", a:"Put", k:"nuc", sh:["p","M219.1,221.5 L208.7,231.8 L200.8,245.6 L194.6,262.8 L192.5,283.5 L194.3,307.6 L199.4,324.8 L207.0,340.3 L215.6,343.8 L218.0,324.8 L220.1,304.2 L223.2,286.9 L224.9,269.7 L223.5,252.5 L221.8,235.3 Z"], fn:"Motor loop of the basal ganglia", d:[["{C} hemiparesis when it spreads into the internal capsule (striatocapsular)","contra"],["{C} dystonia or hemichorea","contra"],["Most common site of hypertensive hemorrhage","bi"]]},
    {id:"gp", n:"Globus pallidus", a:"GP", k:"nuc", sh:["p","M232.8,262.8 L224.2,254.2 L222.2,273.2 L219.4,293.8 L222.5,305.9 L230.4,293.8 L234.6,278.3 Z"], fn:"Output of the basal ganglia", d:[["{C} dystonia or parkinsonism","contra"],["Apathy","bi"]]},
    {id:"cau", n:"Caudate head", a:"Cd", k:"nuc", sh:["p","M238.7,181.9 L248.3,190.5 L260.4,200.8 L270.7,211.2 L276.6,221.5 L277.6,238.7 L274.2,252.5 L273.1,266.3 L266.2,267.0 L259.4,261.1 L252.5,251.8 L245.6,242.2 L238.7,231.8 L232.5,221.5 L230.4,209.4 L231.8,197.4 L234.6,187.1 Z"], fn:"Associative and limbic basal ganglia loops", d:[["Abulia, apathy, disinhibition, executive dysfunction","bi"],["{C} hemichorea (rare)","contra"]]},
    {id:"alic", n:"Internal capsule, anterior limb", a:"ALIC", k:"tract", sh:["p","M232.8,187.1 L225.9,193.9 L219.1,214.6 L219.1,228.4 L222.8,245.6 L225.3,264.6 L243.2,268.0 L252.5,251.8 L245.6,242.2 L238.7,231.8 L232.5,221.5 L230.4,209.4 L231.8,197.4 Z"], fn:"Frontopontine fibers and the anterior thalamic radiation", d:[["Abulia, executive dysfunction (frontothalamic disconnection)","bi"],["Mild {C} face and arm weakness near the genu","contra"]]},
    {id:"genu", n:"Internal capsule, genu", a:"Genu", k:"tract", sh:["e",248.3,272.5,12.4,9.6], fn:"Corticobulbar fibers", d:[D.face,D.dys,["Dysphagia","bi"]]},
    {id:"plica", n:"Posterior limb of internal capsule, anterior part", a:"PLIC", k:"tract", sh:["p","M255.2,281.8 L236.3,279.4 L224.2,281.8 L220.8,293.8 L218.7,312.8 L239.4,312.8 L243.9,300.7 L250.1,290.4 Z"], fn:"Corticospinal fibers: arm, then leg", d:[["{C} face, arm and leg weakness, all similar (pure motor)","contra"]]},
    {id:"plicp", n:"Posterior limb of internal capsule, posterior part", a:"PLICs", k:"tract", sh:["p","M239.4,312.8 L218.7,312.8 L216.3,328.3 L216.0,345.5 L229.4,350.7 L234.6,343.8 L235.9,328.3 Z"], fn:"Thalamocortical sensory radiation; posterior corticospinal (leg) fibers", d:[D.hemisens,["{C} leg weakness","contra"]]},
    {id:"rlic", n:"Retrolenticular internal capsule", a:"RL", k:"tract", sh:["p","M232.5,351.0 L216.0,345.5 L205.3,343.8 L196.7,355.8 L200.1,371.3 L215.6,373.1 L229.4,367.9 Z"], fn:"Optic radiation leaving the lateral geniculate; auditory radiation", d:[D.hemianopia]},
    {id:"thal", n:"Thalamus", a:"Th", k:"nuc", sh:["p","M293.1,280.1 L279.3,278.7 L263.8,281.4 L251.8,288.7 L243.2,300.7 L239.7,317.9 L235.9,335.2 L233.9,352.4 L239.7,366.2 L253.5,376.5 L270.7,378.2 L282.8,367.9 L289.7,352.4 L294.5,335.2 L295.2,307.6 L294.8,286.9 Z"], fn:"Relay and integration hub", d:[D.hemisens]},
    {id:"tan", n:"Anterior nucleus of thalamus", a:"AN", k:"nuc", sh:["e",276.6,289.0,11.0,8.3], fn:"Papez circuit relay to the cingulate", d:[["Anterograde amnesia","bi"],["Apathy, perseveration","bi"]]},
    {id:"tvl", n:"Ventral anterior and ventral lateral nuclei", a:"VA/VL", k:"nuc", sh:["e",257.3,304.9,11.7,14.5], fn:"Basal ganglia and cerebellar relay to motor cortex", d:[["{C} ataxia or tremor (thalamic ataxia)","contra"],["{C} asterixis or dystonia","contra"]]},
    {id:"tmd", n:"Mediodorsal nucleus", a:"MD", k:"nuc", sh:["e",282.1,319.7,11.0,20.7], fn:"Prefrontal relay: memory, motivation, executive function", d:[["Apathy, abulia, executive dysfunction","bi"],["Anterograde amnesia","bi"],["Hypersomnolence and vertical gaze palsy if both sides (paramedian syndrome)","bi"]]},
    {id:"tvp", n:"Ventral posterolateral and posteromedial nuclei", a:"VPL/VPM", k:"nuc", sh:["e",250.4,332.4,11.7,13.8], fn:"Sensory relay for body (VPL) and face (VPM)", d:[["{C} loss of all sensation in face, arm and leg","contra"],["Later {C} central post-stroke pain (Dejerine–Roussy)","contra"]]},
    {id:"pul", n:"Pulvinar", a:"Pul", k:"nuc", sh:["p","M281.1,348.9 L262.1,344.8 L243.2,345.5 L234.6,353.1 L240.1,366.2 L253.8,375.8 L270.4,377.2 L282.1,367.5 Z"], fn:"Visual attention and association", d:[["{C} visual neglect","contra","R"],["Thalamic aphasia (fluent, anomic, repetition preserved)","bi","L"]]},
    {id:"lgn", n:"Lateral geniculate nucleus", a:"LGN", k:"nuc", sh:["e",227.0,362.7,8.3,6.2], fn:"Visual relay", d:[["{C} homonymous hemianopia or sectoranopia","contra"]]},
    {id:"fh", n:"Lateral ventricle, frontal horn", a:"FH", k:"csf", sh:["p","M241.4,175.0 L251.8,176.7 L258.7,185.3 L269.0,193.9 L286.2,199.1 L296.6,207.7 L297.6,231.8 L297.2,262.8 L291.4,269.7 L279.3,272.5 L273.8,266.3 L274.5,252.5 L278.0,238.7 L276.9,221.5 L271.1,211.2 L260.7,200.8 L249.0,190.5 L239.4,181.5 Z"], d:[]},
    {id:"atr", n:"Lateral ventricle, atrium", a:"Atr", k:"csf", sh:["p","M236.3,393.7 L222.5,388.9 L208.7,395.4 L198.4,409.2 L195.3,431.6 L194.6,452.3 L200.1,464.3 L207.7,452.3 L218.7,436.8 L229.4,426.4 L237.3,416.1 L240.1,404.1 Z"], d:[]},
    {id:"orad", n:"Optic radiation (sagittal stratum)", a:"OR", k:"tract", sh:["p","M196.7,369.6 L184.3,374.8 L177.4,410.9 L177.4,452.3 L185.6,474.7 L194.6,467.8 L191.2,435.1 L193.2,404.1 Z"], fn:"LGN to calcarine cortex", d:[D.hemianopia]},
    {id:"arc", n:"Arcuate fasciculus", a:"AF", k:"tract", sh:["e",162.2,404.1,13.8,29.3], fn:"Links Wernicke and Broca areas", d:[["Conduction aphasia: fluent, poor repetition","bi","L"],["{C} neglect","contra","R"]]},
    {id:"ccg", n:"Corpus callosum, genu", a:"CCg", k:"tract", s:"M", sh:["p","M362.0,168.1 L337.9,159.5 L300.0,161.2 L262.1,159.5 L238.0,168.1 L239.7,175.3 L258.7,185.0 L286.2,196.0 L300.0,197.4 L313.8,196.0 L341.3,185.0 L360.3,175.3 Z"], fn:"Connects the frontal lobes", d:[["Impaired bimanual coordination, apathy","bi"]]},
    {id:"ccs", n:"Corpus callosum, splenium", a:"CCs", k:"tract", s:"M", sh:["p","M358.6,388.6 L331.0,386.1 L300.0,384.8 L269.0,386.1 L241.4,388.6 L235.9,402.3 L240.1,419.2 L269.0,422.7 L300.0,423.3 L331.0,422.7 L359.9,419.2 L364.1,402.3 Z"], fn:"Connects the occipital and parietal lobes", d:[["Left-hand tactile anomia, impaired transfer of visual information","bi"]]},
    {id:"fx", n:"Fornix (columns)", a:"Fx", k:"tract", s:"M", sh:["e",300.0,267.7,9.0,9.6], fn:"Hippocampus to mammillary bodies", d:[["Anterograde amnesia","bi"]]},
    {id:"v3", n:"Third ventricle", a:"3V", k:"csf", s:"M", sh:["p","M305.5,285.2 L294.5,285.2 L293.5,328.3 L291.0,367.9 L309.0,367.9 L306.5,328.3 Z"], d:[]}
  ],
  terr:[
    {id:"mcai", n:"MCA inferior division (M2–M4): temporal and temporo-occipital branches", f:"MCA", sh:["w",200,290]},
    {id:"mcas", n:"MCA superior division (M2–M4): orbitofrontal, prefrontal and opercular branches", f:"MCA", sh:["w",290,345]},
    {id:"ins", n:"MCA insular segment (M2): short insular arteries", f:"MCA", sh:["p","M200.1,187.1 L186.3,214.6 L182.9,252.5 L182.9,290.4 L186.3,321.4 L196.7,355.8 L186.3,376.5 L163.9,352.4 L153.3,314.5 L149.8,283.5 L151.2,252.5 L155.3,221.5 L169.1,183.6 Z"]},
    {id:"aca", n:"ACA (A2–A3): orbitofrontal, frontopolar and pericallosal branches", f:"ACA", sh:["w",345,100]},
    {id:"pca", n:"PCA cortical (P3–P4): calcarine, parieto-occipital and posterior temporal branches", f:"PCA", sh:["w",100,200]},
    {id:"lsa", n:"Lateral lenticulostriate arteries (M1 MCA): putamen, lateral pallidum, upper posterior limb", f:"MCAd", sh:["p","M229.4,183.6 L215.6,211.2 L198.4,242.2 L189.8,269.7 L191.2,304.2 L198.0,328.3 L214.6,345.5 L234.6,340.3 L239.4,314.5 L244.2,300.7 L251.8,285.2 L243.2,268.0 L236.3,238.7 L232.5,211.2 Z"]},
    {id:"heub", n:"Recurrent artery of Heubner (from the A1–A2 junction, ACA)", f:"ACAd", sh:["p","M238.0,175.0 L224.9,190.5 L219.4,214.6 L231.1,228.4 L246.6,240.4 L262.1,247.3 L274.5,245.6 L275.9,224.9 L269.0,204.3 L255.2,185.3 Z"]},
    {id:"acha", n:"Anterior choroidal artery (from the supraclinoid ICA)", f:"AChA", sh:["p","M239.4,312.8 L218.0,312.8 L215.3,338.6 L202.2,345.5 L194.9,362.7 L201.8,376.5 L227.7,374.8 L235.2,348.9 Z"]},
    {id:"polar", n:"Tuberothalamic (polar) artery (from the posterior communicating artery)", f:"PCom", sh:["e",272.4,290.4,17.2,12.4]},
    {id:"para", n:"Paramedian thalamic (thalamoperforating) arteries from P1; a single artery of Percheron supplies both sides", f:"PCAd", sh:["e",284.2,319.7,13.1,24.8]},
    {id:"tg", n:"Inferolateral (thalamogeniculate) arteries (from P2 PCA)", f:"PCAd", sh:["e",249.7,330.0,13.8,18.6]},
    {id:"pch", n:"Posterior choroidal arteries, medial and lateral (from P2 PCA)", f:"PCAd", sh:["e",262.1,360.7,26.2,15.2]},
    {id:"spl", n:"Posterior pericallosal (splenial) artery (from P3–P4 PCA)", f:"PCA", sh:["e",275.9,404.1,29.3,18.9]},
    {id:"genu", n:"Pericallosal artery (A2–A3) and subcallosal branch of the anterior communicating artery", f:"ACA", sh:["e",275.9,176.7,27.6,14.5]},
    {id:"acom", n:"Subcallosal and septal perforators of the anterior communicating artery", f:"ACAd", sh:["e",294.5,258.7,7.6,17.9]}
  ],
  syn:[
    {n:"Pure motor hemiparesis (lacunar)", need:[["plica","genu"]], not:["tvp","plicp","ifg","hes","wer","v1","rlic","thal","put"], t:"Equal face, arm and leg weakness without sensory, visual or cognitive signs; lipohyalinosis of a lenticulostriate or anterior choroidal perforator."},
    {n:"Pure sensory stroke (thalamic lacune)", need:[["tvp"]], not:["plica","plicp","genu"], t:"Numbness of face, arm and leg on one side, often splitting the midline exactly; thalamogeniculate perforator."},
    {n:"Sensorimotor stroke", need:[["plica","genu"],["tvp","plicp"]], t:"Weakness and sensory loss together from the posterior limb and thalamus."},
    {n:"Dysarthria–clumsy hand syndrome", need:[["genu"]], not:["tvp"], t:"Dysarthria, facial weakness and a clumsy hand from a lacune at the genu (or basis pontis)."},
    {n:"Anterior choroidal artery syndrome", need:[["plicp","plica"],["rlic","lgn","orad"]], t:"Hemiparesis, hemisensory loss and homonymous hemianopia with preserved language and cognition."},
    {n:"Recurrent artery of Heubner syndrome", need:[["cau"],["alic"]], t:"Face and arm weakness with dysarthria and abulia; damage to the caudate head and anterior limb."},
    {n:"Striatocapsular infarct", need:[["put"],["plica","alic","genu"]], t:"Comma-shaped infarct of several lenticulostriates, usually embolic M1 occlusion with good cortical collaterals; may add cortical signs."},
    {n:"Broca aphasia", only:"L", need:[["ifg"]], t:"Nonfluent, effortful, agrammatic speech with relatively preserved comprehension; often right face and arm weakness."},
    {n:"Wernicke aphasia", only:"L", need:[["wer"]], t:"Fluent, paraphasic speech with poor comprehension and repetition, often without weakness."},
    {n:"Global aphasia", only:"L", need:[["ifg"],["wer","hes"]], t:"Loss of expression and comprehension; usually a large MCA infarct."},
    {n:"Conduction aphasia", only:"L", need:[["arc"]], t:"Poor repetition with fluent speech and good comprehension."},
    {n:"Thalamic pain syndrome (Dejerine–Roussy)", need:[["tvp"]], t:"Hemisensory loss followed weeks to months later by burning pain and allodynia."},
    {n:"Paramedian thalamic syndrome", bi:[["tmd"]], t:"Hypersomnolence, vertical gaze palsy, amnesia and apathy; a single artery of Percheron from one P1 supplies both sides."},
    {n:"Tuberothalamic (polar) infarct", need:[["tan"]], t:"Apathy, perseveration and amnesia with little motor deficit."},
    {n:"Alexia without agraphia", only:"L", need:[["ccs"],["v1","orad","wmO"]], t:"Can write but not read; left occipital lesion plus splenium disconnects the intact right visual cortex from left language areas (left PCA)."},
    {n:"Cortical blindness / Anton syndrome", bi:[["v1"]], t:"Bilateral occipital infarcts (top of the basilar, both PCAs); pupils react normally; patients may deny blindness."},
    {n:"Hemispatial neglect", only:"R", need:[["wer","mt","arc","pul","wmO","ifg"]], t:"Neglect of the left side of space from right temporoparietal, frontal or pulvinar damage."}
  ],
  presets:[
    {n:"Left posterior limb lacune", sh:[["e",368.9,296.6,6.9,10.3]]},
    {n:"Right thalamic (VPL/VPM) lacune", sh:[["e",250.4,332.4,9.6,11.0]]},
    {n:"Left striatocapsular infarct", sh:[["p","M372.3,197.4 L386.1,221.5 L403.3,252.5 L408.5,286.9 L403.3,304.2 L386.1,309.3 L370.6,304.2 L360.3,293.8 L351.7,280.1 L358.6,259.4 L367.2,231.8 Z"]]},
    {n:"Right caudate and anterior limb", sh:[["p","M236.3,181.9 L222.2,200.8 L220.1,228.4 L226.3,252.5 L246.6,267.0 L266.2,262.8 L271.1,242.2 L267.6,214.6 L253.8,192.2 Z"]]},
    {n:"Left occipital and splenium", sh:[["p","M310.3,388.6 L341.3,390.3 L382.7,431.6 L403.3,486.7 L396.4,562.5 L355.1,617.6 L320.7,610.7 L327.6,534.9 L334.4,466.1 L313.8,424.7 Z"]]}
  ]
});

/* ---------------- Coronal · thalamus ---------------- */
S.push({
  id:"cor", group:"Cerebrum", name:"Coronal · thalamus and internal capsule", w:600, h:560, center:[174,310],
  view:"Coronal, through the posterior limb and mid-thalamus · top of the head up",
  outline:"M22.0,242.5 L22.0,278.0 L29.9,297.7 L29.9,309.6 L22.0,325.3 L22.0,345.1 L25.9,349.0 L22.0,412.1 L29.9,427.9 L29.9,439.7 L49.6,479.1 L65.4,502.8 L83.1,516.6 L91.0,516.6 L95.0,520.5 L114.7,520.5 L118.6,524.5 L134.4,524.5 L138.3,528.4 L146.2,528.4 L150.2,524.5 L169.9,524.5 L173.8,520.5 L181.7,520.5 L191.6,510.7 L195.5,498.9 L213.2,489.0 L240.9,457.4 L252.7,457.4 L272.4,477.2 L288.2,477.2 L296.1,469.3 L303.9,469.3 L311.8,477.2 L327.6,477.2 L347.3,457.4 L359.1,457.4 L386.8,489.0 L404.5,498.9 L408.4,510.7 L418.3,520.5 L461.7,528.4 L465.6,524.5 L505.0,520.5 L524.8,512.7 L550.4,479.1 L570.1,439.7 L570.1,427.9 L578.0,412.1 L578.0,376.6 L574.1,372.7 L578.0,325.3 L570.1,309.6 L570.1,297.7 L578.0,278.0 L578.0,242.5 L574.1,238.6 L574.1,226.8 L566.2,211.0 L562.2,191.3 L550.4,171.6 L550.4,163.7 L534.6,144.0 L530.7,132.1 L509.0,110.4 L497.2,106.5 L461.7,67.1 L442.0,63.1 L430.1,51.3 L414.4,43.4 L382.8,43.4 L351.3,31.6 L323.7,31.6 L303.9,47.3 L296.1,47.3 L276.3,31.6 L248.7,31.6 L217.2,43.4 L185.6,43.4 L169.9,51.3 L158.0,63.1 L138.3,67.1 L102.8,106.5 L91.0,110.4 L69.3,132.1 L65.4,144.0 L49.6,163.7 L49.6,171.6 L37.8,191.3 L37.8,199.2 L25.9,226.8 L25.9,238.6 Z",
  hemi:"M22.0,242.5 L22.0,278.0 L29.9,297.7 L29.9,309.6 L22.0,325.3 L22.0,345.1 L25.9,349.0 L22.0,412.1 L29.9,427.9 L29.9,439.7 L49.6,479.1 L75.2,512.7 L95.0,520.5 L134.4,524.5 L138.3,528.4 L146.2,528.4 L150.2,524.5 L169.9,524.5 L173.8,520.5 L181.7,520.5 L191.6,510.7 L195.5,498.9 L213.2,489.0 L240.9,457.4 L252.7,457.4 L272.4,477.2 L288.2,477.2 L298.0,467.3 L298.0,49.3 L284.2,35.5 L276.3,31.6 L248.7,31.6 L217.2,43.4 L185.6,43.4 L169.9,51.3 L158.0,63.1 L138.3,67.1 L102.8,106.5 L91.0,110.4 L69.3,132.1 L65.4,144.0 L49.6,163.7 L49.6,171.6 L37.8,191.3 L37.8,199.2 L25.9,226.8 L25.9,238.6 Z",
  inner:"M33.8,246.5 L37.8,266.2 L51.6,280.0 L81.1,278.0 L85.1,309.6 L77.2,329.3 L61.4,345.1 L81.1,360.8 L77.2,396.3 L67.3,390.4 L53.5,404.2 L79.2,433.8 L93.0,439.7 L106.8,465.3 L146.2,473.2 L221.1,406.2 L240.9,402.2 L260.6,422.0 L268.5,422.0 L282.3,408.2 L282.3,392.4 L290.1,372.7 L274.4,349.0 L278.3,341.1 L270.4,301.7 L274.4,282.0 L260.6,268.2 L242.8,262.3 L246.8,254.4 L242.8,230.7 L248.7,228.7 L276.3,244.5 L290.1,230.7 L282.3,222.8 L286.2,199.2 L272.4,185.4 L252.7,185.4 L242.8,175.5 L242.8,163.7 L256.6,145.9 L268.5,145.9 L282.3,132.1 L282.3,124.2 L270.4,108.5 L286.2,92.7 L286.2,53.3 L268.5,39.5 L250.7,57.2 L250.7,65.1 L233.0,94.7 L217.2,90.7 L209.3,98.6 L197.5,98.6 L185.6,110.4 L179.7,108.5 L171.8,88.8 L158.0,75.0 L150.2,71.0 L142.3,75.0 L124.5,96.6 L148.2,124.2 L148.2,136.1 L130.4,153.8 L116.6,159.7 L98.9,189.3 L79.2,165.6 L49.6,195.2 L49.6,203.1 L69.3,226.8 L59.5,236.6 L47.6,232.7 Z",
  structs:[
    {id:"cr", n:"Corona radiata and centrum semiovale", a:"CR", k:"wm", sh:["w",290,90], clip:"wm", fn:"Motor and sensory projection fibers, association fibers", d:[D.wkFAL,D.hemisens]},
    {id:"twm", n:"Temporal white matter (temporal stem, Meyer loop)", a:"T-WM", k:"wm", sh:["w",180,290], clip:"wm", fn:"Meyer loop, uncinate fasciculus", d:[["{C} superior quadrantanopia","contra"]]},
    {id:"pcl", n:"Paracentral lobule and medial frontoparietal cortex", a:"PCL", k:"ctx", sh:["w",0,60], clip:"ctx", fn:"Leg motor and sensory cortex; micturition control", d:[["{C} leg weakness and leg sensory loss","contra"],["Urinary incontinence","bi"]]},
    {id:"m1", n:"Precentral gyrus (arm and hand)", a:"M1", k:"ctx", sh:["w",320,360], clip:"ctx", fn:"Primary motor cortex", d:[["{C} arm and hand weakness","contra"]]},
    {id:"m1f", n:"Precentral operculum (face, tongue, larynx)", a:"M1f", k:"ctx", sh:["w",285,320], clip:"ctx", fn:"Face and mouth motor cortex", d:[D.face,D.dys,["Apraxia of speech if dominant","bi","L"]]},
    {id:"stg", n:"Superior temporal gyrus (auditory cortex; Wernicke area posteriorly)", a:"STG", k:"ctx", sh:["w",245,285], clip:"ctx", fn:"Hearing and language comprehension", d:[["Wernicke-type aphasia","bi","L"],["Receptive aprosodia","bi","R"]]},
    {id:"itg", n:"Middle and inferior temporal gyri", a:"ITG", k:"ctx", sh:["w",190,245], clip:"ctx", fn:"Semantic memory, object and face recognition", d:[["Anomia, semantic deficits","bi","L"],["Prosopagnosia (right fusiform, worse if both sides)","bi","R"]]},
    {id:"cing", n:"Cingulate gyrus", a:"Cg", k:"ctx", sh:["e",282.3,201.1,16.6,20.5], fn:"Motivation, emotion, memory", d:[["Apathy; akinetic mutism if both sides","bi"]]},
    {id:"lv", n:"Lateral ventricle (body)", a:"LV", k:"csf", sh:["p","M229.0,226.8 L242.8,226.8 L258.6,234.7 L274.4,242.5 L290.1,250.4 L291.3,262.3 L280.3,266.2 L264.5,264.2 L252.7,260.3 L242.8,252.4 L234.9,240.6 Z"], d:[]},
    {id:"cau", n:"Caudate body", a:"Cd", k:"nuc", sh:["e",234.5,255.9,11.0,9.5], fn:"Associative basal ganglia loop", d:[["Abulia, executive dysfunction","bi"]]},
    {id:"ins", n:"Insular cortex", a:"Ins", k:"ctx", sh:["p","M142.3,250.4 L158.0,262.3 L162.0,301.7 L160.8,341.1 L156.1,368.7 L142.3,376.6 L126.5,349.0 L122.6,309.6 L126.5,270.1 Z"], fn:"Interoception, taste, autonomic control", d:[["Taste and autonomic disturbance","bi"],["Apraxia of speech","bi","L"]]},
    {id:"put", n:"Putamen", a:"Put", k:"nuc", sh:["p","M193.5,270.1 L185.6,282.0 L179.3,309.6 L177.8,341.1 L180.9,360.8 L191.6,368.7 L201.4,360.8 L203.4,329.3 L201.4,297.7 Z"], fn:"Motor basal ganglia loop", d:[["{C} hemiparesis if the capsule is involved; dystonia","contra"]]},
    {id:"gp", n:"Globus pallidus", a:"GP", k:"nuc", sh:["p","M207.3,297.7 L203.0,321.4 L203.8,349.0 L207.3,366.8 L217.2,356.9 L221.1,333.2 L219.2,309.6 Z"], fn:"Basal ganglia output", d:[["{C} dystonia or parkinsonism","contra"]]},
    {id:"plic", n:"Posterior limb of internal capsule", a:"PLIC", k:"tract", sh:["p","M226.7,272.1 L215.2,274.1 L211.3,301.7 L217.2,329.3 L219.2,353.0 L225.1,370.7 L236.9,358.9 L230.6,337.2 L226.3,309.6 Z"], fn:"Corticospinal and thalamocortical fibers", d:[D.wkFAL,D.hemisens]},
    {id:"thl", n:"Thalamus, lateral part (VL, VPL, VPM)", a:"Th-L", k:"nuc", sh:["p","M262.5,271.7 L248.7,271.7 L234.5,276.1 L229.0,293.8 L226.7,313.5 L229.8,333.2 L238.9,345.1 L260.6,351.4 L262.5,309.6 Z"], fn:"Motor and sensory relay", d:[["{C} loss of all sensation; later central pain","contra"],D.ataxC]},
    {id:"thm", n:"Thalamus, medial part (mediodorsal, intralaminar)", a:"Th-M", k:"nuc", sh:["p","M291.3,274.1 L276.3,271.7 L262.5,271.7 L262.5,309.6 L260.6,351.4 L284.2,356.1 L292.1,349.0 L292.9,309.6 Z"], fn:"Arousal, memory, executive function", d:[["Apathy, memory loss; somnolence if both sides","bi"]]},
    {id:"stn", n:"Subthalamic nucleus", a:"STN", k:"nuc", sh:["e",254.7,361.6,13.4,7.1], fn:"Indirect pathway of the basal ganglia", d:[["{C} hemiballism","contra"]]},
    {id:"cp", n:"Cerebral peduncle and substantia nigra", a:"CP", k:"tract", sh:["p","M227.0,372.7 L244.8,367.9 L258.6,388.4 L280.3,418.0 L276.3,427.1 L256.6,420.0 L240.9,400.3 L223.1,384.5 Z"], fn:"Descending corticofugal fibers; dopaminergic neurons", d:[D.wkFAL,["{C} parkinsonism","contra"]]},
    {id:"ot", n:"Optic tract", a:"OT", k:"tract", sh:["e",215.2,379.0,8.7,5.9], fn:"Crossed and uncrossed retinal fibers to the LGN", d:[["{C} incongruous homonymous hemianopia, RAPD in the {C} eye","contra"]]},
    {id:"th", n:"Temporal horn", a:"TH", k:"csf", sh:["p","M165.9,392.4 L197.5,386.5 L225.1,388.4 L231.0,398.3 L213.2,401.1 L181.7,404.2 L162.0,404.2 Z"], d:[]},
    {id:"hip", n:"Hippocampus", a:"Hip", k:"ctx", sh:["e",193.5,423.9,26.8,18.9], fn:"Episodic memory", d:[["Anterograde amnesia (verbal if left, visual if right; severe if both)","bi"]]},
    {id:"cc", n:"Corpus callosum (body)", a:"CC", k:"tract", s:"M", sh:["p","M371.0,214.9 L339.4,218.9 L300.0,224.8 L260.6,218.9 L229.0,214.9 L229.0,226.0 L244.8,224.8 L260.6,232.7 L276.3,240.6 L290.1,248.5 L300.0,252.4 L309.9,248.5 L323.7,240.6 L339.4,232.7 L355.2,224.8 L371.0,226.0 Z"], fn:"Connects the two hemispheres", d:[["Callosal disconnection: left-hand apraxia, alien hand","bi"]]},
    {id:"fx", n:"Fornix (body)", a:"Fx", k:"tract", s:"M", sh:["e",300.0,269.0,15.0,6.7], fn:"Papez circuit", d:[["Anterograde amnesia","bi"]]},
    {id:"v3", n:"Third ventricle", a:"3V", k:"csf", s:"M", sh:["p","M306.3,276.1 L293.7,276.1 L292.9,366.8 L307.1,366.8 Z"], d:[]},
    {id:"mb", n:"Mammillary bodies and posterior hypothalamus", a:"MB", k:"nuc", s:"M", sh:["e",300.0,382.5,17.7,9.1], fn:"Papez circuit; arousal and temperature regulation", d:[["Anterograde amnesia (Korsakoff)","bi"],["Hypersomnolence, temperature instability","bi"]]}
  ],
  terr:[
    {id:"mcas", n:"MCA superior division (M2–M4): rolandic and prerolandic branches", f:"MCA", sh:["w",280,360]},
    {id:"mcai", n:"MCA inferior division (M2–M4): temporal branches", f:"MCA", sh:["w",215,280]},
    {id:"aca", n:"ACA (A2–A4): callosomarginal and pericallosal branches", f:"ACA", sh:["w",0,80]},
    {id:"pca", n:"PCA (P2–P3): anterior and posterior temporal and hippocampal branches", f:"PCA", sh:["w",150,215]},
    {id:"wsa", n:"Anterior watershed: ACA–MCA cortical border zone", f:"WS", sh:["w",348,10], clip:"ctx"},
    {id:"ibz", n:"MCA medullary (superficial perforating) arteries; internal border zone with the lenticulostriates", f:"MCAd", sh:["e",209.3,207.0,31.5,19.7]},
    {id:"lsa", n:"Lateral lenticulostriate arteries (M1 MCA)", f:"MCAd", sh:["p","M240.9,246.5 L221.1,222.8 L189.6,254.4 L173.8,301.7 L175.8,353.0 L193.5,372.7 L217.2,360.8 L229.0,325.3 L234.9,285.9 Z"]},
    {id:"acha", n:"Anterior choroidal artery (ICA): lower posterior limb, optic tract, uncus and hippocampal head", f:"AChA", sh:["p","M225.1,325.3 L213.2,333.2 L209.3,372.7 L205.4,388.4 L173.8,400.3 L169.9,443.6 L221.1,447.6 L233.0,404.2 L236.9,372.7 L231.0,349.0 Z"]},
    {id:"tg", n:"Inferolateral (thalamogeniculate) arteries (from P2 PCA)", f:"PCAd", sh:["e",246.4,313.5,18.1,33.5]},
    {id:"para", n:"Paramedian thalamic (thalamoperforating) arteries (from P1 PCA)", f:"PCAd", sh:["e",280.3,309.6,13.4,35.5]},
    {id:"mes", n:"Mesencephalic and subthalamic perforators from P1 and the posterior communicating artery", f:"PCAd", sh:["p","M227.0,370.7 L248.7,364.8 L264.5,356.9 L292.1,372.7 L292.1,435.8 L272.4,431.8 L252.7,416.0 L223.1,384.5 Z"]},
    {id:"pcom", n:"Posteromedial perforators from the PComm and P1 (hypothalamus, mammillary bodies)", f:"PCom", sh:["e",284.2,376.6,15.8,11.8]}
  ],
  syn:[
    {n:"Pure motor hemiparesis (lacunar)", need:[["plic"]], not:["thl","m1","m1f","pcl"], t:"Lacune of the posterior limb; lenticulostriate (upper) or anterior choroidal (lower) territory."},
    {n:"Hemiballism", need:[["stn"]], t:"Violent flinging movements of the opposite limbs from a subthalamic nucleus lesion, usually a small perforator infarct."},
    {n:"Thalamic sensory stroke", need:[["thl"]], not:["plic"], t:"Opposite hemisensory loss, sometimes followed by central post-stroke pain."},
    {n:"Anterior cerebral artery syndrome", need:[["pcl"]], t:"Leg more than arm weakness and sensory loss, abulia, urinary incontinence."},
    {n:"Korsakoff-type amnesia", need:[["mb","fx","thm"]], t:"Anterograde amnesia from the mammillary bodies, fornix or medial thalamus (Papez circuit)."},
    {n:"Bilateral hippocampal amnesia", bi:[["hip"]], t:"Severe anterograde amnesia; consider bilateral PCA infarction, hypoxia, herpes simplex or autoimmune encephalitis."}
  ],
  presets:[
    {n:"Left posterior limb lacune", sh:[["e",380.8,317.5,7.1,19.7]]},
    {n:"Right subthalamic nucleus", sh:[["e",254.7,361.6,12.6,9.5]]},
    {n:"Right ACA territory", sh:[["p","M298.0,222.8 L298.0,57.2 L276.3,45.4 L244.8,53.3 L244.8,136.1 L264.5,191.3 L276.3,218.9 Z"]]}
  ]
});

/* ---------------- Sagittal · midline ---------------- */
S.push({
  id:"sag", group:"Cerebrum", name:"Sagittal · midline", w:600, h:450, center:[310,190], mid:true,
  view:"Midline sagittal · front of the head to the left · medial surface of one hemisphere",
  outline:"M70,232 C48,150 120,52 262,40 C400,30 528,86 548,190 C558,246 532,296 482,304 C440,308 400,290 372,276 C350,268 330,266 312,266 C270,268 210,284 150,286 C110,288 80,268 70,232 Z M293.8,263.7 L300.9,300.1 L290.0,325.6 L294.6,352.1 L311.9,372.9 L322.8,396.5 L339.1,433.6 L354.8,480.5 L379.5,482.1 L376.1,436.0 L361.2,376.1 L373.6,324.6 L354.4,284.1 L341.2,247.2 Z M382.2,285.9 L444.2,283.5 L510.4,314.1 L535.7,355.0 L517.3,402.9 L459.5,438.3 L408.3,415.3 L382.8,377.6 L404.0,333.2 Z",
  hemi:"M70,232 C48,150 120,52 262,40 C400,30 528,86 548,190 C558,246 532,296 482,304 C440,308 400,290 372,276 C350,268 330,266 312,266 C270,268 210,284 150,286 C110,288 80,268 70,232 Z",
  inner:"M110,226 C96,160 150,86 262,78 C380,70 488,116 506,192 C514,232 498,262 470,266 C430,268 400,256 372,246 C340,238 300,236 270,240 C220,248 170,256 140,254 C122,252 112,242 110,226 Z",
  structs:[
    {id:"cga", n:"Anterior cingulate gyrus and cingulum", a:"aCg", k:"ctx", s:"M", sh:["w",240,20], clip:"wm", fn:"Motivation, attention, error monitoring", d:[["Apathy; akinetic mutism if both sides","bi"]]},
    {id:"cgp", n:"Posterior cingulate gyrus and cingulum", a:"pCg", k:"ctx", s:"M", sh:["w",20,130], clip:"wm", fn:"Memory and spatial orientation", d:[["Memory and spatial orientation problems","bi"]]},
    {id:"gr", n:"Gyrus rectus and medial orbitofrontal cortex", a:"OFC", k:"ctx", s:"M", sh:["w",235,270], clip:"ctx", fn:"Social behaviour; olfactory tract runs beneath", d:[["Disinhibition, poor judgment, personality change","bi"],["Anosmia (olfactory tract)","bi"]]},
    {id:"mpf", n:"Medial prefrontal cortex (frontal pole, medial superior frontal gyrus)", a:"mPFC", k:"ctx", s:"M", sh:["w",270,320], clip:"ctx", fn:"Initiative and motivation", d:[["Apathy, abulia","bi"]]},
    {id:"sma", n:"Supplementary motor area", a:"SMA", k:"ctx", s:"M", sh:["w",320,350], clip:"ctx", fn:"Starting and sequencing movement", d:[["Opposite-side leg weakness and akinesia; transcortical motor aphasia if dominant","bi"],["Alien hand (with the callosum)","bi"]]},
    {id:"pcl", n:"Paracentral lobule (leg motor and sensory)", a:"PCL", k:"ctx", s:"M", sh:["w",350,20], clip:"ctx", fn:"Leg movement and sensation; bladder control", d:[["Opposite-side leg weakness and sensory loss","bi"],["Urinary incontinence","bi"]]},
    {id:"pcun", n:"Precuneus", a:"PCun", k:"ctx", s:"M", sh:["w",20,60], clip:"ctx", fn:"Visuospatial imagery", d:[["Topographical disorientation","bi"]]},
    {id:"cun", n:"Cuneus (upper bank of the calcarine fissure)", a:"Cun", k:"ctx", s:"M", sh:["w",60,95], clip:"ctx", fn:"Primary visual cortex for the lower field", d:[["Opposite inferior homonymous quadrantanopia","bi"]]},
    {id:"lin", n:"Lingual gyrus (lower bank of the calcarine fissure)", a:"Lin", k:"ctx", s:"M", sh:["w",95,128], clip:"ctx", fn:"Primary visual cortex for the upper field; colour", d:[["Opposite superior homonymous quadrantanopia","bi"],["Achromatopsia or prosopagnosia with fusiform involvement","bi"]]},
    {id:"phg", n:"Parahippocampal and medial temporo-occipital cortex", a:"PHG", k:"ctx", s:"M", sh:["w",128,160], clip:"ctx", fn:"Scene memory and navigation", d:[["Topographic agnosia, memory impairment","bi"]]},
    {id:"lv", n:"Lateral ventricle (seen through the septum)", a:"LV", k:"csf", s:"M", sh:["p","M227.7,180.7 L271.6,170.5 L333.1,177.9 L357.1,189.3 L343.8,204.8 L285.2,200.9 L238.6,204.3 L214.2,199.4 Z"], d:[]},
    {id:"ccg", n:"Corpus callosum, rostrum and genu", a:"CCg", k:"tract", s:"M", sh:["p","M161.2,205.7 L178.6,174.2 L217.0,153.8 L229.1,157.9 L227.7,180.7 L208.8,186.0 L189.3,201.1 L184.9,223.7 L199.1,244.3 L211.0,251.6 L198.3,257.3 L171.5,239.1 Z"], fn:"Connects the frontal lobes", d:[["Impaired bimanual coordination, apathy","bi"]]},
    {id:"ccb", n:"Corpus callosum, body", a:"CCb", k:"tract", s:"M", sh:["p","M229.1,157.9 L273.2,144.5 L334.6,151.8 L358.7,163.2 L357.5,182.8 L333.3,174.6 L271.8,167.3 L227.7,180.7 Z"], fn:"Connects motor and sensory cortex", d:[["Callosal disconnection: left-hand apraxia, agraphia and tactile anomia; alien hand","bi"]]},
    {id:"ccs", n:"Corpus callosum, splenium", a:"CCs", k:"tract", s:"M", sh:["p","M358.7,163.2 L376.8,171.0 L399.8,198.7 L404.6,221.9 L391.3,237.4 L373.4,226.4 L368.4,206.4 L357.5,182.8 Z"], fn:"Connects occipital and parietal cortex", d:[["Visual transfer deficits; with a left occipital lesion, alexia without agraphia","bi"]]},
    {id:"fx", n:"Fornix", a:"Fx", k:"tract", s:"M", sh:["p","M367.6,219.5 L331.7,200.7 L270.0,196.6 L244.0,217.8 L248.6,244.3 L257.8,244.9 L256.1,221.9 L275.4,210.1 L331.1,210.5 L360.9,228.8 Z"], fn:"Hippocampus to mammillary bodies and septum", d:[["Anterograde amnesia","bi"]]},
    {id:"bf", n:"Basal forebrain (septal nuclei, nucleus basalis)", a:"BF", k:"nuc", s:"M", sh:["p","M202.0,247.7 L202.9,244.7 L205.3,242.2 L208.8,240.2 L213.2,239.1 L218.0,239.0 L222.7,239.8 L226.9,241.4 L230.2,243.8 L232.2,246.7 L232.8,249.8 L231.8,252.7 L229.5,255.3 L225.9,257.3 L221.6,258.4 L216.8,258.5 L212.0,257.7 L207.8,256.1 L204.6,253.7 L202.5,250.8 Z"], fn:"Cholinergic projection to cortex and hippocampus", d:[["Amnesia with confabulation (anterior communicating artery aneurysm rupture)","bi"]]},
    {id:"th", n:"Thalamus (medial surface)", a:"Th", k:"nuc", s:"M", sh:["p","M265.6,219.2 L268.2,211.3 L274.7,204.4 L284.6,199.3 L296.9,196.4 L310.3,196.0 L323.5,198.2 L335.3,202.7 L344.5,209.1 L350.2,216.8 L351.8,225.0 L349.2,232.9 L342.7,239.7 L332.8,244.9 L320.5,247.8 L307.1,248.2 L293.9,246.0 L282.1,241.5 L272.9,235.1 L267.2,227.4 Z"], fn:"Relay and arousal", d:[["Medial: apathy, amnesia, somnolence; lateral: hemisensory loss","bi"]]},
    {id:"hy", n:"Hypothalamus", a:"Hy", k:"nuc", s:"M", sh:["p","M248.2,250.8 L258.3,287.5 L289.1,289.5 L288.2,253.5 Z"], fn:"Homeostasis: temperature, appetite, thirst, sleep, endocrine and autonomic control", d:[["Disordered temperature, appetite, thirst (diabetes insipidus) and sleep","bi"],["Hypopituitarism","bi"]]},
    {id:"mb", n:"Mammillary body", a:"MB", k:"nuc", s:"M", sh:["p","M281.1,289.0 L281.7,286.6 L282.9,284.5 L284.8,282.9 L287.1,281.9 L289.6,281.7 L292.1,282.2 L294.2,283.5 L295.9,285.4 L296.9,287.6 L297.1,290.1 L296.6,292.4 L295.3,294.6 L293.5,296.2 L291.2,297.1 L288.7,297.3 L286.2,296.8 L284.0,295.5 L282.4,293.7 L281.4,291.4 Z"], fn:"Papez circuit", d:[["Anterograde amnesia (Korsakoff syndrome)","bi"]]},
    {id:"och", n:"Optic chiasm", a:"OCh", k:"tract", s:"M", sh:["p","M234.3,276.1 L235.0,274.1 L236.9,272.4 L239.7,271.1 L243.2,270.4 L247.0,270.4 L250.8,270.9 L254.2,272.1 L256.8,273.7 L258.4,275.6 L258.9,277.7 L258.2,279.7 L256.3,281.4 L253.5,282.6 L250.0,283.3 L246.2,283.4 L242.4,282.8 L239.0,281.7 L236.4,280.0 L234.7,278.1 Z"], fn:"Crossing of nasal retinal fibers", d:[["Bitemporal hemianopia","bi"]]},
    {id:"pit", n:"Pituitary gland", a:"Pit", k:"nuc", s:"M", sh:["p","M228.8,315.0 L229.6,311.5 L231.6,308.4 L234.4,306.1 L238.0,304.7 L241.8,304.4 L245.6,305.2 L248.9,307.0 L251.5,309.7 L253.1,313.0 L253.5,316.6 L252.6,320.1 L250.7,323.2 L247.8,325.5 L244.3,326.9 L240.4,327.2 L236.7,326.4 L233.3,324.5 L230.7,321.8 L229.2,318.5 Z"], fn:"Endocrine control", d:[["Hormone deficiency or excess; compresses the chiasm when enlarged","bi"]]},
    {id:"pin", n:"Pineal gland", a:"Pin", k:"nuc", s:"M", sh:["p","M366.5,239.0 L367.1,236.5 L368.5,234.4 L370.7,232.7 L373.3,231.7 L376.2,231.5 L379.0,232.1 L381.5,233.4 L383.5,235.4 L384.6,237.7 L384.9,240.3 L384.3,242.8 L382.9,244.9 L380.7,246.6 L378.1,247.6 L375.2,247.8 L372.4,247.2 L369.9,245.9 L367.9,243.9 L366.8,241.6 Z"], fn:"Melatonin", d:[["A pineal mass compresses the tectum (Parinaud syndrome) and aqueduct (hydrocephalus)","bi"]]},
    {id:"tect", n:"Midbrain tectum (superior and inferior colliculi)", a:"Tect", k:"nuc", s:"M", sh:["p","M348.1,260.7 L349.1,253.7 L351.0,247.4 L353.7,242.6 L356.9,239.5 L360.3,238.6 L363.6,240.0 L366.4,243.4 L368.4,248.6 L369.6,255.1 L369.7,262.2 L368.7,269.2 L366.8,275.4 L364.1,280.3 L360.9,283.4 L357.5,284.3 L354.2,282.9 L351.4,279.5 L349.4,274.3 L348.2,267.8 Z"], fn:"Visual and auditory orienting; vertical gaze centers nearby", d:[["Upgaze palsy, light-near dissociation (Parinaud)","bi"]]},
    {id:"mbt", n:"Midbrain tegmentum and cerebral peduncles", a:"MB", k:"tract", s:"M", sh:["p","M293.8,263.7 L341.2,247.2 L348.1,286.9 L306.6,307.1 L295.1,293.2 Z"], fn:"Third nerve, red nucleus, peduncles, arousal system", d:[["Third nerve palsy, vertical gaze palsy, hemiparesis, reduced consciousness","bi"]]},
    {id:"aq", n:"Cerebral aqueduct", a:"Aq", k:"csf", s:"M", sh:["p","M342.5,266.9 L343.0,261.9 L343.8,257.4 L344.8,253.8 L346.0,251.6 L347.2,250.8 L348.3,251.7 L349.2,254.1 L349.8,257.8 L350.0,262.3 L349.9,267.4 L349.4,272.4 L348.6,276.9 L347.6,280.5 L346.4,282.7 L345.2,283.4 L344.1,282.6 L343.2,280.2 L342.6,276.5 L342.4,271.9 Z"], d:[["Obstruction causes hydrocephalus","bi"]]},
    {id:"pb", n:"Basis pontis", a:"BP", k:"tract", s:"M", sh:["p","M300.9,300.1 L290.0,325.6 L294.6,352.1 L311.9,372.9 L334.3,361.3 L334.4,308.9 Z"], fn:"Corticospinal tracts and pontine nuclei", d:[["Quadriparesis and anarthria with preserved vertical gaze and blinking (locked-in) if both sides","bi"]]},
    {id:"ptg", n:"Pontine tegmentum", a:"PT", k:"nuc", s:"M", sh:["p","M334.4,308.9 L334.3,361.3 L361.2,376.1 L373.6,324.6 L354.0,290.6 Z"], fn:"Gaze centers, cranial nerve nuclei, reticular formation", d:[["Horizontal gaze palsy, INO, facial palsy; coma if both sides","bi"]]},
    {id:"v4", n:"Fourth ventricle", a:"4V", k:"csf", s:"M", sh:["p","M371.9,301.6 L404.2,329.9 L377.0,370.7 Z"], d:[]},
    {id:"med", n:"Medulla", a:"Med", k:"tract", s:"M", sh:["p","M311.9,372.9 L334.3,361.3 L361.2,376.1 L376.1,436.0 L379.5,482.1 L354.8,480.5 L339.1,433.6 L322.8,396.5 Z"], fn:"Lower cranial nerves, respiratory and cardiovascular centers", d:[["Dysphagia, dysarthria, hiccups, respiratory and blood pressure instability; hemiparesis","bi"]]},
    {id:"vsup", n:"Cerebellar vermis, anterior and superior", a:"Vs", k:"ctx", s:"M", sh:["p","M387.9,292.8 L444.0,286.7 L504.2,313.7 L533.0,348.3 L446.8,342.6 L404.2,329.9 Z"], fn:"Gait and posture", d:[["Gait and truncal ataxia, leg ataxia","bi"]]},
    {id:"vinf", n:"Cerebellar vermis, posterior and inferior (nodulus, uvula)", a:"Vi", k:"ctx", s:"M", sh:["p","M403.8,336.4 L532.6,354.8 L517.5,399.6 L459.7,435.1 L411.6,412.2 L386.0,374.5 Z"], fn:"Balance and eye movements", d:[["Truncal ataxia, nystagmus, vertigo","bi"]]}
  ],
  terr:[
    {id:"aca", n:"ACA (A2–A4): pericallosal and callosomarginal branches", f:"ACA", sh:["w",240,25]},
    {id:"pca", n:"PCA (P3–P4): calcarine, parieto-occipital and posterior pericallosal branches", f:"PCA", sh:["w",25,160]},
    {id:"acom", n:"Anterior communicating artery perforators (subcallosal and hypothalamic branches)", f:"ACAd", sh:["p","M202.0,247.7 L203.3,242.8 L206.7,238.4 L211.7,235.1 L217.8,233.2 L224.5,232.9 L231.1,234.1 L237.0,236.8 L241.6,240.7 L244.3,245.5 L245.1,250.6 L243.7,255.6 L240.4,259.9 L235.4,263.2 L229.3,265.1 L222.5,265.5 L215.9,264.2 L210.0,261.5 L205.5,257.6 L202.7,252.8 Z"]},
    {id:"tp", n:"Posteromedial central (thalamoperforating) arteries from P1 and the PComm", f:"PCAd", sh:["p","M249.0,237.8 L252.1,225.8 L259.8,215.4 L271.2,207.5 L285.3,202.8 L300.7,201.9 L315.8,204.9 L329.2,211.3 L339.6,220.7 L345.9,232.1 L347.6,244.3 L344.4,256.2 L336.8,266.7 L325.3,274.6 L311.2,279.3 L295.9,280.2 L280.8,277.2 L267.4,270.8 L257.0,261.4 L250.7,250.0 Z"]},
    {id:"shy", n:"Superior hypophyseal arteries (supraclinoid ICA)", f:"ICA", sh:["p","M226.7,298.5 L227.9,291.5 L230.5,285.2 L234.2,280.4 L238.7,277.5 L243.5,276.7 L248.2,278.1 L252.3,281.6 L255.4,286.9 L257.2,293.4 L257.5,300.5 L256.3,307.5 L253.8,313.7 L250.1,318.5 L245.6,321.5 L240.7,322.3 L236.0,320.9 L231.9,317.3 L228.8,312.1 L227.0,305.6 Z"]},
    {id:"spl", n:"Posterior pericallosal (splenial) artery (PCA)", f:"PCA", sh:["p","M365.6,203.0 L367.0,196.0 L370.5,189.8 L375.6,185.1 L381.8,182.3 L388.5,181.6 L395.1,183.1 L400.9,186.8 L405.4,192.2 L408.1,198.7 L408.7,205.8 L407.2,212.8 L403.8,219.0 L398.7,223.7 L392.5,226.6 L385.7,227.2 L379.1,225.7 L373.3,222.0 L368.9,216.7 L366.2,210.1 Z"]},
    {id:"quad", n:"Quadrigeminal (collicular) and posterior medial choroidal arteries (P1–P2)", f:"PCAd", sh:["p","M347.0,254.1 L348.3,245.1 L351.0,237.1 L354.8,230.8 L359.3,226.9 L364.2,225.8 L368.8,227.5 L372.9,232.0 L375.9,238.7 L377.6,247.0 L377.8,256.2 L376.5,265.2 L373.8,273.2 L370.0,279.5 L365.4,283.3 L360.6,284.5 L355.9,282.7 L351.9,278.3 L348.9,271.5 L347.2,263.2 Z"]},
    {id:"bas", n:"Basilar artery paramedian perforators (midbrain and pons)", f:"BA", sh:["p","M293.8,263.7 L300.9,300.1 L290.0,325.6 L294.6,352.1 L311.9,372.9 L361.2,376.1 L373.6,324.6 L354.4,284.1 L341.2,247.2 Z"]},
    {id:"vert", n:"Vertebral artery and anterior spinal artery branches (medulla)", f:"VA", sh:["p","M311.9,372.9 L334.3,361.3 L361.2,376.1 L376.1,436.0 L379.5,482.1 L354.8,480.5 L339.1,433.6 L322.8,396.5 Z"]},
    {id:"sca", n:"Superior cerebellar artery (superior vermis)", f:"SCA", sh:["p","M387.9,292.8 L444.0,286.7 L504.2,313.7 L533.0,348.3 L446.8,342.6 L404.2,329.9 Z"]},
    {id:"pica", n:"Posterior inferior cerebellar artery, medial branch (inferior vermis, nodulus)", f:"PICA", sh:["p","M403.8,336.4 L532.6,354.8 L517.5,399.6 L459.7,435.1 L411.6,412.2 L386.0,374.5 Z"]}
  ],
  syn:[
    {n:"Parinaud (dorsal midbrain) syndrome", need:[["tect","pin"]], t:"Upgaze palsy, convergence-retraction nystagmus, light-near dissociation, lid retraction; pineal tumors and hydrocephalus."},
    {n:"Korsakoff-type amnesia", need:[["mb","fx"]], t:"Anterograde amnesia from the mammillary bodies or fornix (thiamine deficiency, tumors, surgery)."},
    {n:"Locked-in syndrome", need:[["pb"]], t:"Bilateral ventral pontine infarction from basilar thrombosis; vertical eye movements and blinking preserved."},
    {n:"Callosal disconnection syndrome", need:[["ccb"]], t:"Left-hand apraxia, agraphia and tactile anomia; intermanual conflict (alien hand)."},
    {n:"Anterior cerebral artery syndrome", need:[["pcl","sma"]], t:"Leg-predominant weakness and sensory loss, abulia, incontinence."},
    {n:"Chiasmal syndrome", need:[["och","pit"]], t:"Bitemporal hemianopia from pituitary adenoma, craniopharyngioma or meningioma."},
    {n:"Hypothalamic syndrome", need:[["hy"]], t:"Diabetes insipidus, hyperphagia or anorexia, temperature dysregulation, sleep disturbance, hypopituitarism."}
  ],
  presets:[
    {n:"Pineal region mass", sh:[["p","M350.7,244.5 L351.9,239.6 L354.8,235.2 L359.1,231.8 L364.4,229.9 L370.1,229.5 L375.8,230.6 L380.8,233.3 L384.7,237.2 L387.0,241.9 L387.6,247.0 L386.4,252.0 L383.5,256.3 L379.2,259.7 L373.9,261.6 L368.1,262.1 L362.5,260.9 L357.5,258.2 L353.6,254.3 L351.2,249.6 Z"]]},
    {n:"Ventral pontine infarct", sh:[["p","M292.7,332.3 L293.7,325.3 L295.9,319.1 L298.9,314.2 L302.6,311.2 L306.4,310.3 L310.2,311.7 L313.4,315.2 L315.8,320.4 L317.2,326.9 L317.4,334.0 L316.3,341.0 L314.2,347.2 L311.2,352.1 L307.5,355.1 L303.6,355.9 L299.9,354.6 L296.7,351.1 L294.3,345.9 L292.9,339.4 Z"]]},
    {n:"Paracentral ACA infarct", sh:[["e",318,60,30,20]]}
  ]
});

window.LOC_SLICES = S;
})();
