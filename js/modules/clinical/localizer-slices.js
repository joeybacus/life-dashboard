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
  id:"ax-cr", group:"Cerebrum", name:"Axial · corona radiata", w:600, h:660, center:[184,326],
  view:"Axial, at the bodies of the lateral ventricles · front at the top", outline:"M44.4,315.5 L48.0,340.9 L44.4,395.3 L48.0,398.9 L51.6,449.6 L55.3,453.3 L55.3,464.2 L84.3,514.9 L87.9,529.4 L113.3,558.4 L113.3,562.0 L147.7,596.5 L165.8,607.4 L173.1,607.4 L194.9,625.5 L231.1,640.0 L267.4,640.0 L281.9,632.7 L296.4,618.2 L303.6,618.2 L318.1,632.7 L332.6,640.0 L368.9,640.0 L405.1,625.5 L426.9,607.4 L434.2,607.4 L452.3,596.5 L486.7,562.0 L486.7,558.4 L512.1,529.4 L515.7,514.9 L544.7,464.2 L548.4,431.5 L552.0,427.9 L552.0,398.9 L555.6,395.3 L555.6,366.3 L552.0,362.6 L552.0,333.6 L555.6,330.0 L555.6,315.5 L552.0,311.9 L552.0,297.4 L541.1,279.2 L541.1,253.9 L533.9,239.4 L533.9,232.1 L523.0,221.2 L523.0,203.1 L519.4,199.5 L512.1,170.5 L497.6,152.3 L494.0,134.2 L483.1,119.7 L479.5,108.8 L434.2,59.9 L416.0,56.3 L387.0,30.9 L361.6,27.3 L347.1,20.0 L325.4,20.0 L321.8,23.6 L314.5,23.6 L303.6,34.5 L296.4,34.5 L285.5,23.6 L278.2,23.6 L274.6,20.0 L252.9,20.0 L238.4,27.3 L213.0,30.9 L184.0,56.3 L165.8,59.9 L120.5,108.8 L116.9,119.7 L106.0,134.2 L102.4,152.3 L87.9,170.5 L84.3,188.6 L77.0,203.1 L77.0,221.2 L66.1,232.1 L66.1,239.4 L58.9,253.9 L58.9,279.2 L48.0,297.4 L48.0,311.9 Z", hemi:"M44.4,315.5 L48.0,340.9 L44.4,395.3 L48.0,398.9 L51.6,449.6 L55.3,453.3 L55.3,464.2 L84.3,514.9 L87.9,529.4 L113.3,558.4 L113.3,562.0 L147.7,596.5 L165.8,607.4 L173.1,607.4 L194.9,625.5 L231.1,640.0 L267.4,640.0 L281.9,632.7 L298.2,616.4 L298.2,36.3 L285.5,23.6 L278.2,23.6 L274.6,20.0 L252.9,20.0 L238.4,27.3 L213.0,30.9 L184.0,56.3 L165.8,59.9 L120.5,108.8 L116.9,119.7 L106.0,134.2 L102.4,152.3 L87.9,170.5 L84.3,188.6 L77.0,203.1 L77.0,221.2 L66.1,232.1 L66.1,239.4 L58.9,253.9 L58.9,279.2 L48.0,297.4 L48.0,311.9 Z", inner:"M58.9,304.6 L58.9,311.9 L71.6,324.6 L82.5,324.6 L98.8,333.6 L98.8,348.1 L86.1,349.9 L73.4,362.6 L86.1,375.3 L95.1,377.1 L95.1,395.3 L98.8,398.9 L98.8,406.1 L77.0,431.5 L87.9,446.0 L73.4,467.8 L86.1,480.5 L107.8,473.2 L120.5,475.0 L127.8,496.8 L116.9,507.7 L129.6,520.4 L144.1,520.4 L156.8,533.0 L160.4,547.5 L142.3,569.3 L165.8,592.9 L182.2,580.2 L182.2,569.3 L171.3,554.8 L176.7,553.0 L184.0,560.2 L198.5,563.9 L236.5,594.7 L218.4,612.8 L231.1,629.1 L267.4,625.5 L280.1,612.8 L276.4,601.9 L287.3,591.1 L265.6,565.7 L283.7,547.5 L256.5,527.6 L243.8,533.0 L243.8,471.4 L249.2,469.6 L256.5,476.8 L269.2,464.2 L265.6,460.5 L283.7,442.4 L272.8,427.9 L298.2,409.8 L298.2,217.6 L289.1,215.8 L272.8,199.5 L283.7,188.6 L283.7,177.7 L271.0,165.0 L260.1,165.0 L251.1,156.0 L254.7,116.1 L272.8,98.0 L265.6,87.1 L265.6,72.6 L283.7,50.8 L283.7,43.6 L271.0,30.9 L254.7,43.6 L254.7,50.8 L245.6,59.9 L223.9,38.1 L203.9,58.1 L207.5,76.2 L218.4,87.1 L209.4,99.8 L194.9,103.4 L200.3,94.3 L184.0,74.4 L162.2,103.4 L151.3,103.4 L138.7,116.1 L145.9,123.3 L131.4,137.8 L153.2,156.0 L153.2,163.2 L138.7,185.0 L131.4,206.7 L120.5,217.6 L124.2,221.2 L124.2,239.4 L107.8,255.7 L86.1,237.5 L73.4,250.2 L69.8,261.1 L86.1,277.4 L97.0,277.4 L106.0,290.1 L89.7,302.8 L82.5,302.8 L71.6,291.9 Z",
  structs:[
    {id:"wmF", n:"Frontal white matter", a:"F-WM", k:"wm", sh:["p","M300.0,-72.5 L-44.4,-72.5 L-44.4,337.3 L300.0,337.3 Z"], clip:"wm", fn:"Frontostriatal, frontothalamic and premotor connections", d:[["Apathy, slowed thinking, executive dysfunction","bi"]]},
    {id:"wmP", n:"Parietal white matter", a:"P-WM", k:"wm", sh:["p","M300.0,337.3 L-44.4,337.3 L-44.4,707.1 L300.0,707.1 Z"], clip:"wm", fn:"Parietal association fibers", d:[["{C} cortical-type sensory loss","contra"],["{C} hemispatial neglect","contra","R"],["Ideomotor apraxia","bi","L"]]},
    {id:"sma", n:"Supplementary motor area and medial superior frontal gyrus", a:"SMA", k:"ctx", sh:["p","M300.0,199.5 L249.2,199.5 L249.2,362.6 L300.0,362.6 Z"], clip:"ctx", fn:"Starting and sequencing movement", d:[["{C} leg-predominant weakness and akinesia","contra"],["Transcortical motor aphasia (sparse speech, repetition preserved)","bi","L"],["Alien hand (with callosal involvement)","contra"]]},
    {id:"pfc", n:"Prefrontal convexity (superior and middle frontal gyri)", a:"PFC", k:"ctx", sh:["p","M300.0,-72.5 L-44.4,-72.5 L-44.4,286.5 L191.2,282.9 L249.2,282.9 L249.2,199.5 L300.0,199.5 Z"], clip:"ctx", fn:"Executive control, working memory; frontal eye field in the posterior middle frontal gyrus", d:[["Dysexecutive syndrome: poor planning, set-shifting and working memory","bi"],["Eyes deviate toward the {I} side acutely (frontal eye field)","ipsi"]]},
    {id:"m1", n:"Precentral gyrus (primary motor: hand and arm)", a:"M1", k:"ctx", sh:["p","M249.2,282.9 L191.2,282.9 L-44.4,286.5 L-44.4,337.3 L191.2,340.9 L249.2,340.9 Z"], clip:"ctx", fn:"Voluntary movement, hand and arm at this level", d:[["{C} hand and arm weakness, leg spared","contra"]]},
    {id:"s1", n:"Postcentral gyrus (primary somatosensory: hand and arm)", a:"S1", k:"ctx", sh:["p","M249.2,340.9 L191.2,340.9 L-44.4,337.3 L-44.4,391.6 L191.2,395.3 L249.2,395.3 Z"], clip:"ctx", fn:"Touch, position and discriminative sensation", d:[["{C} loss of position sense, two-point discrimination and stereognosis in the hand","contra"]]},
    {id:"smg", n:"Supramarginal gyrus", a:"SMG", k:"ctx", sh:["p","M249.2,395.3 L191.2,395.3 L-44.4,391.6 L-44.4,471.4 L249.2,471.4 Z"], clip:"ctx", fn:"Phonological processing (left); spatial attention (right)", d:[["Conduction aphasia","bi","L"],["Ideomotor apraxia","bi","L"],["{C} neglect and anosognosia","contra","R"],["{C} sensory extinction","contra"]]},
    {id:"ang", n:"Angular gyrus", a:"AG", k:"ctx", sh:["p","M249.2,471.4 L-44.4,471.4 L-44.4,540.3 L249.2,540.3 Z"], clip:"ctx", fn:"Reading, writing, calculation (left); spatial attention (right)", d:[["Gerstmann syndrome: agraphia, acalculia, finger agnosia, left-right confusion","bi","L"],["Alexia with agraphia; anomia","bi","L"],["{C} hemispatial neglect","contra","R"]]},
    {id:"spl", n:"Superior parietal lobule", a:"SPL", k:"ctx", sh:["p","M249.2,540.3 L-44.4,540.3 L-44.4,707.1 L249.2,707.1 Z"], clip:"ctx", fn:"Visually guided reaching, body schema", d:[["{C} optic ataxia (misreaching under visual guidance)","contra"],["{C} cortical sensory loss","contra"]]},
    {id:"pcun", n:"Precuneus and posterior medial parietal cortex", a:"PCun", k:"ctx", sh:["p","M300.0,362.6 L249.2,362.6 L249.2,707.1 L300.0,707.1 Z"], clip:"ctx", fn:"Spatial imagery, self-referential processing", d:[["Topographical disorientation, impaired visual imagery","bi"]]},
    {id:"lv", n:"Lateral ventricle (body)", a:"LV", k:"csf", sh:["p","M247.4,228.5 L263.7,235.7 L281.9,250.2 L289.1,286.5 L283.7,322.7 L271.0,344.5 L256.5,373.5 L242.0,398.9 L223.9,417.0 L214.8,409.8 L220.2,380.8 L225.7,351.8 L231.1,315.5 L238.4,279.2 L243.8,250.2 Z"], d:[]},
    {id:"cau", n:"Caudate body", a:"Cd", k:"nuc", sh:["p","M243.8,228.5 L234.7,235.7 L227.5,264.7 L223.9,301.0 L223.9,330.0 L228.9,330.0 L232.6,308.2 L238.4,279.2 L243.8,250.2 Z"], fn:"Associative and limbic loops of the basal ganglia", d:[["Abulia, apathy, executive dysfunction","bi"],["{C} chorea (rare)","contra"]]},
    {id:"crm", n:"Corona radiata: motor fibers (corticospinal and corticobulbar)", a:"CR-m", k:"tract", sh:["e",207.5,319.1,16.3,39.9], fn:"Descending motor fibers: face anterolateral, arm, leg posteromedial", d:[D.wkFAL,D.dys]},
    {id:"crs", n:"Corona radiata: sensory radiation (thalamocortical)", a:"CR-s", k:"tract", sh:["e",200.3,380.8,16.3,19.9], fn:"Ascending fibers from VPL and VPM to the postcentral gyrus", d:[D.hemisens]},
    {id:"slf", n:"Superior longitudinal and arcuate fasciculus", a:"SLF", k:"tract", sh:["e",165.8,351.8,14.5,72.5], fn:"Links frontal, parietal and temporal language and attention areas", d:[["Conduction aphasia (poor repetition)","bi","L"],["{C} hemispatial neglect","contra","R"],["Ideomotor apraxia","bi","L"]]}
  ],
  terr:[
    {id:"mcas", n:"MCA superior division (M2–M4): prerolandic, rolandic and anterior parietal branches", f:"MCA", sh:["p","M213.0,-72.5 L-44.4,-72.5 L-44.4,417.0 L213.0,417.0 Z"]},
    {id:"mcai", n:"MCA inferior division (M2–M4): angular and posterior parietal branches", f:"MCA", sh:["p","M213.0,417.0 L-44.4,417.0 L-44.4,707.1 L155.0,707.1 L191.2,616.4 L213.0,562.0 Z"]},
    {id:"aca", n:"ACA (A2–A4): callosomarginal and pericallosal branches", f:"ACA", sh:["p","M300.0,-72.5 L213.0,-72.5 L213.0,562.0 L245.6,580.2 L300.0,591.1 Z"]},
    {id:"pca", n:"PCA (P4): parieto-occipital branch", f:"PCA", sh:["p","M300.0,591.1 L245.6,580.2 L213.0,562.0 L191.2,616.4 L155.0,707.1 L300.0,707.1 Z"]},
    {id:"wsa", n:"Anterior watershed: ACA–MCA cortical border zone", f:"WS", sh:["p","M234.7,-72.5 L191.2,-72.5 L191.2,235.7 L234.7,235.7 Z"], clip:"ctx"},
    {id:"wsp", n:"Posterior watershed: MCA–PCA cortical border zone", f:"WS", sh:["p","M213.0,533.0 L118.7,533.0 L82.5,670.8 L191.2,670.8 Z"], clip:"ctx"},
    {id:"ibz", n:"MCA medullary (superficial perforating) arteries; a chain of lesions here is the internal border zone", f:"MCAd", sh:["e",211.2,315.5,19.9,101.5]},
    {id:"lsa", n:"Lateral lenticulostriate arteries (M1 MCA)", f:"MCAd", sh:["e",231.1,286.5,14.5,58.0]}
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
    {n:"Left corona radiata lacune", sh:[["e",392.5,311.9,10.9,14.5]]},
    {n:"Left angular gyrus infarct", sh:[["e",503.0,504.0,25.4,25.4]]},
    {n:"Right internal border zone chain", sh:[["e",211.2,279.2,9.1,9.1],["e",211.2,315.5,9.1,9.1],["e",207.5,351.8,9.1,9.1]]}
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
  id:"sag", group:"Cerebrum", name:"Sagittal · midline", w:600, h:450, center:[284,207], mid:true,
  view:"Midline sagittal · front of the head to the left · medial surface of one hemisphere",
  outline:"M58.1,218.0 L58.1,271.4 L74.9,302.4 L84.8,312.2 L96.0,317.8 L107.3,317.8 L110.1,320.7 L132.6,323.5 L135.4,326.3 L166.4,326.3 L169.2,323.5 L186.1,320.7 L202.9,312.2 L222.6,306.6 L239.5,284.1 L248.0,284.1 L250.8,286.9 L287.3,286.9 L294.4,296.7 L291.6,302.4 L291.6,330.5 L294.4,333.3 L297.2,347.4 L305.6,361.4 L318.3,374.1 L329.5,379.7 L335.2,379.7 L339.4,384.0 L350.6,409.3 L371.7,436.0 L397.1,436.0 L408.3,416.3 L428.0,410.7 L437.9,400.8 L440.7,386.8 L450.5,374.1 L478.6,362.9 L496.9,350.2 L505.4,333.3 L505.4,322.1 L499.7,313.6 L491.3,308.0 L491.3,293.9 L498.3,286.9 L520.8,281.3 L527.9,274.2 L533.5,260.2 L533.5,248.9 L541.9,229.2 L541.9,198.3 L519.4,153.3 L516.6,142.0 L505.4,125.1 L491.3,113.9 L477.2,82.9 L467.4,73.1 L456.1,67.5 L450.5,59.0 L433.6,50.6 L416.8,36.5 L394.2,33.7 L374.6,16.8 L315.5,14.0 L312.7,16.8 L298.6,16.8 L278.9,28.1 L253.6,25.3 L250.8,28.1 L242.3,28.1 L239.5,30.9 L225.4,33.7 L211.4,42.1 L191.7,47.8 L172.0,61.8 L166.4,61.8 L155.1,67.5 L138.2,81.5 L127.0,87.1 L103.1,111.1 L103.1,113.9 L86.2,133.6 L77.7,150.4 L77.7,156.1 L66.5,173.0 L66.5,181.4 L60.9,192.6 L60.9,215.2 Z",
  hemi:"M58.1,218.0 L58.1,271.4 L76.3,303.8 L84.8,312.2 L96.0,317.8 L107.3,317.8 L110.1,320.7 L132.6,323.5 L135.4,326.3 L166.4,326.3 L169.2,323.5 L186.1,320.7 L202.9,312.2 L222.6,306.6 L240.9,282.7 L242.3,267.2 L248.0,267.2 L278.9,250.3 L332.4,247.5 L349.2,239.1 L354.9,239.1 L368.9,230.6 L388.6,230.6 L391.4,227.8 L408.3,227.8 L411.1,225.0 L413.9,227.8 L453.3,239.1 L461.8,244.7 L475.8,247.5 L484.3,253.1 L498.3,255.9 L506.8,264.4 L526.5,275.6 L533.5,260.2 L533.5,248.9 L541.9,229.2 L541.9,198.3 L519.4,153.3 L516.6,142.0 L505.4,125.1 L491.3,113.9 L477.2,82.9 L467.4,73.1 L456.1,67.5 L450.5,59.0 L433.6,50.6 L416.8,36.5 L394.2,33.7 L374.6,16.8 L315.5,14.0 L312.7,16.8 L298.6,16.8 L278.9,28.1 L253.6,25.3 L250.8,28.1 L242.3,28.1 L239.5,30.9 L225.4,33.7 L211.4,42.1 L191.7,47.8 L172.0,61.8 L166.4,61.8 L155.1,67.5 L138.2,81.5 L127.0,87.1 L103.1,111.1 L103.1,113.9 L86.2,133.6 L77.7,150.4 L77.7,156.1 L66.5,173.0 L66.5,181.4 L60.9,192.6 L60.9,215.2 Z",
  inner:"M302.8,170.1 L308.4,175.8 L305.6,178.6 L315.5,188.4 L335.2,185.6 L360.5,216.6 L376.0,203.9 L376.0,181.4 L360.5,165.9 L312.7,160.3 Z M297.2,248.9 L304.2,250.3 L319.7,246.1 L304.2,244.7 Z M159.3,223.6 L162.1,232.0 L174.8,244.7 L194.5,244.7 L204.3,234.8 L193.1,223.6 L195.9,206.7 L225.4,182.8 L239.5,174.4 L242.3,177.2 L248.0,171.5 L250.8,174.4 L260.6,164.5 L250.8,154.7 L245.1,160.3 L242.3,157.5 L236.7,163.1 L233.9,160.3 L217.0,168.7 L183.2,191.2 L165.0,209.5 Z",
  structs:[
    {id:"cga", n:"Anterior cingulate gyrus and cingulum", a:"aCg", k:"ctx", s:"M", sh:["p","M121.4,263.0 L121.4,184.2 L155.1,133.6 L205.8,111.1 L284.5,105.4 L284.5,161.7 L228.3,150.4 L183.2,167.3 L160.7,206.7 L160.7,251.7 Z"], clip:"hemi", fn:"Motivation, attention, error monitoring", d:[["Apathy; akinetic mutism if both sides","bi"]]},
    {id:"cgp", n:"Posterior cingulate gyrus and cingulum", a:"pCg", k:"ctx", s:"M", sh:["p","M284.5,105.4 L354.9,105.4 L383.0,150.4 L391.4,192.6 L383.0,220.8 L363.3,223.6 L374.6,192.6 L354.9,161.7 L284.5,161.7 Z"], clip:"hemi", fn:"Memory and spatial orientation", d:[["Memory and spatial orientation problems","bi"]]},
    {id:"gr", n:"Gyrus rectus and medial orbitofrontal cortex", a:"OFC", k:"ctx", s:"M", sh:["p","M228.3,223.6 L160.7,223.6 L160.7,257.4 L-10.9,257.4 L-10.9,403.6 L228.3,403.6 Z"], clip:"ctx", fn:"Social behaviour; olfactory tract runs beneath", d:[["Disinhibition, poor judgment, personality change","bi"],["Anosmia (olfactory tract)","bi"]]},
    {id:"mpf", n:"Medial prefrontal cortex (frontal pole, medial superior frontal gyrus)", a:"mPFC", k:"ctx", s:"M", sh:["p","M121.4,257.4 L-10.9,257.4 L-10.9,-32.4 L186.1,-32.4 L186.1,105.4 L205.8,111.1 L155.1,133.6 L121.4,184.2 Z"], clip:"ctx", fn:"Initiative and motivation", d:[["Apathy, abulia","bi"]]},
    {id:"sma", n:"Supplementary motor area", a:"SMA", k:"ctx", s:"M", sh:["p","M186.1,-32.4 L186.1,105.4 L205.8,111.1 L278.9,105.4 L278.9,-32.4 Z"], clip:"ctx", fn:"Starting and sequencing movement", d:[["Opposite-side leg weakness and akinesia; transcortical motor aphasia if dominant","bi"],["Alien hand (with the callosum)","bi"]]},
    {id:"pcl", n:"Paracentral lobule (leg motor and sensory)", a:"PCL", k:"ctx", s:"M", sh:["p","M278.9,-32.4 L278.9,105.4 L383.0,105.4 L383.0,-32.4 Z"], clip:"ctx", fn:"Leg movement and sensation; bladder control", d:[["Opposite-side leg weakness and sensory loss","bi"],["Urinary incontinence","bi"]]},
    {id:"pcun", n:"Precuneus", a:"PCun", k:"ctx", s:"M", sh:["p","M383.0,-32.4 L383.0,105.4 L391.4,192.6 L419.6,229.2 L478.6,122.3 L495.5,-32.4 Z"], clip:"ctx", fn:"Visuospatial imagery", d:[["Topographical disorientation","bi"]]},
    {id:"cun", n:"Cuneus (upper bank of the calcarine fissure)", a:"Cun", k:"ctx", s:"M", sh:["p","M419.6,229.2 L478.6,122.3 L495.5,-32.4 L622.1,-32.4 L622.1,218.0 L526.5,215.2 L425.2,237.7 Z"], clip:"ctx", fn:"Primary visual cortex for the lower field", d:[["Opposite inferior homonymous quadrantanopia","bi"]]},
    {id:"lin", n:"Lingual gyrus (lower bank of the calcarine fissure)", a:"Lin", k:"ctx", s:"M", sh:["p","M425.2,237.7 L526.5,215.2 L622.1,218.0 L622.1,319.2 L509.6,268.6 L453.3,246.1 L411.1,243.3 Z"], clip:"ctx", fn:"Primary visual cortex for the upper field; colour", d:[["Opposite superior homonymous quadrantanopia","bi"],["Achromatopsia or prosopagnosia with fusiform involvement","bi"]]},
    {id:"phg", n:"Parahippocampal and medial temporo-occipital cortex", a:"PHG", k:"ctx", s:"M", sh:["p","M391.4,234.8 L425.2,237.7 L430.8,251.7 L397.1,251.7 Z"], clip:"ctx", fn:"Scene memory and navigation", d:[["Topographic agnosia, memory impairment","bi"]]},
    {id:"lv", n:"Lateral ventricle (seen through the septum)", a:"LV", k:"csf", s:"M", sh:["p","M217.0,187.0 L256.4,175.8 L312.7,178.6 L335.2,187.0 L323.9,201.1 L270.5,201.1 L228.3,206.7 L205.8,203.9 Z"], d:[]},
    {id:"ccg", n:"Corpus callosum, rostrum and genu", a:"CCg", k:"tract", s:"M", sh:["p","M157.9,212.3 L172.0,184.2 L205.8,164.5 L217.0,167.3 L217.0,187.0 L200.1,192.6 L183.2,206.7 L180.4,226.4 L194.5,243.3 L205.8,248.9 L194.5,254.5 L169.2,240.5 Z"], fn:"Connects the frontal lobes", d:[["Impaired bimanual coordination, apathy","bi"]]},
    {id:"ccb", n:"Corpus callosum, body", a:"CCb", k:"tract", s:"M", sh:["p","M217.0,167.3 L256.4,153.3 L312.7,156.1 L335.2,164.5 L335.2,181.4 L312.7,175.8 L256.4,173.0 L217.0,187.0 Z"], fn:"Connects motor and sensory cortex", d:[["Callosal disconnection: left-hand apraxia, agraphia and tactile anomia; alien hand","bi"]]},
    {id:"ccs", n:"Corpus callosum, splenium", a:"CCs", k:"tract", s:"M", sh:["p","M335.2,164.5 L352.0,170.1 L374.6,192.6 L380.2,212.3 L368.9,226.4 L352.0,218.0 L346.4,201.1 L335.2,181.4 Z"], fn:"Connects occipital and parietal cortex", d:[["Visual transfer deficits; with a left occipital lesion, alexia without agraphia","bi"]]},
    {id:"fx", n:"Fornix", a:"Fx", k:"tract", s:"M", sh:["p","M349.2,209.5 L318.3,194.1 L256.4,192.6 L239.5,206.7 L242.3,246.1 L252.2,246.1 L250.8,212.3 L262.0,203.9 L315.5,202.5 L343.6,215.2 Z"], fn:"Hippocampus to mammillary bodies and septum", d:[["Anterograde amnesia","bi"]]},
    {id:"bf", n:"Basal forebrain (septal nuclei, nucleus basalis)", a:"BF", k:"nuc", s:"M", sh:["e",211.4,246.1,14.1,8.4], fn:"Cholinergic projection to cortex and hippocampus", d:[["Amnesia with confabulation (anterior communicating artery aneurysm rupture)","bi"]]},
    {id:"th", n:"Thalamus (medial surface)", a:"Th", k:"nuc", s:"M", sh:["p","M253.6,212.3 L273.3,206.7 L295.8,205.3 L315.5,208.1 L326.7,218.0 L326.7,232.0 L312.7,239.1 L284.5,239.1 L262.0,232.0 Z"], fn:"Relay and arousal", d:[["Medial: apathy, amnesia, somnolence; lateral: hemisensory loss","bi"]]},
    {id:"hy", n:"Hypothalamus", a:"Hy", k:"nuc", s:"M", sh:["p","M239.5,246.1 L250.8,277.0 L278.9,277.0 L276.1,246.1 Z"], fn:"Homeostasis: temperature, appetite, thirst, sleep, endocrine and autonomic control", d:[["Disordered temperature, appetite, thirst (diabetes insipidus) and sleep","bi"],["Hypopituitarism","bi"]]},
    {id:"mb", n:"Mammillary body", a:"MB", k:"nuc", s:"M", sh:["e",278.9,277.0,7.3,6.8], fn:"Papez circuit", d:[["Anterograde amnesia (Korsakoff syndrome)","bi"]]},
    {id:"och", n:"Optic chiasm", a:"OCh", k:"tract", s:"M", sh:["e",239.5,268.6,11.3,5.6], fn:"Crossing of nasal retinal fibers", d:[["Bitemporal hemianopia","bi"]]},
    {id:"pit", n:"Pituitary gland", a:"Pit", k:"nuc", s:"M", sh:["e",239.5,285.5,11.3,8.4], fn:"Endocrine control", d:[["Hormone deficiency or excess; compresses the chiasm when enlarged","bi"]]},
    {id:"pin", n:"Pineal gland", a:"Pin", k:"nuc", s:"M", sh:["e",354.9,229.2,8.4,7.0], fn:"Melatonin", d:[["A pineal mass compresses the tectum (Parinaud syndrome) and aqueduct (hydrocephalus)","bi"]]},
    {id:"tect", n:"Midbrain tectum (superior and inferior colliculi)", a:"Tect", k:"nuc", s:"M", sh:["e",340.8,248.9,9.8,19.7], fn:"Visual and auditory orienting; vertical gaze centers nearby", d:[["Upgaze palsy, light-near dissociation (Parinaud)","bi"]]},
    {id:"mbt", n:"Midbrain tegmentum and cerebral peduncles", a:"Mid", k:"tract", s:"M", sh:["p","M287.3,246.1 L326.7,234.8 L360.5,240.5 L360.5,268.6 L357.7,291.1 L323.9,296.7 L298.6,293.9 L290.2,274.2 Z"], fn:"Third nerve, red nucleus, peduncles, arousal system", d:[["Third nerve palsy, vertical gaze palsy, hemiparesis, reduced consciousness","bi"]]},
    {id:"aq", n:"Cerebral aqueduct", a:"Aq", k:"csf", s:"M", sh:["p","M323.9,243.3 L329.5,243.3 L354.9,274.2 L349.2,277.0 Z"], d:[["Obstruction causes hydrocephalus","bi"]]},
    {id:"pb", n:"Basis pontis", a:"BP", k:"tract", s:"M", sh:["p","M298.6,293.9 L290.2,313.6 L290.2,341.8 L301.4,364.3 L332.4,372.7 L326.7,336.1 L323.9,296.7 Z"], fn:"Corticospinal tracts and pontine nuclei", d:[["Quadriparesis and anarthria with preserved vertical gaze and blinking (locked-in) if both sides","bi"]]},
    {id:"ptg", n:"Pontine tegmentum", a:"PT", k:"nuc", s:"M", sh:["p","M323.9,296.7 L326.7,336.1 L332.4,372.7 L346.4,361.4 L363.3,358.6 L363.3,319.2 L360.5,291.1 L340.8,288.3 Z"], fn:"Gaze centers, cranial nerve nuclei, reticular formation", d:[["Horizontal gaze palsy, INO, facial palsy; coma if both sides","bi"]]},
    {id:"v4", n:"Fourth ventricle", a:"4V", k:"csf", s:"M", sh:["p","M360.5,268.6 L371.7,279.9 L374.6,319.2 L366.1,353.0 L361.9,319.2 L359.1,285.5 Z"], d:[]},
    {id:"med", n:"Medulla", a:"Med", k:"tract", s:"M", sh:["p","M332.4,372.7 L346.4,361.4 L363.3,358.6 L371.7,375.5 L380.2,403.6 L397.1,437.4 L368.9,443.0 L352.0,409.3 L340.8,389.6 Z"], fn:"Lower cranial nerves, respiratory and cardiovascular centers", d:[["Dysphagia, dysarthria, hiccups, respiratory and blood pressure instability; hemiparesis","bi"]]},
    {id:"vsup", n:"Cerebellar vermis, anterior and superior", a:"Vs", k:"ctx", s:"M", sh:["p","M368.9,268.6 L391.4,243.3 L425.2,234.8 L459.0,251.7 L487.1,279.9 L498.3,313.6 L425.2,313.6 L385.8,305.2 Z"], fn:"Gait and posture", d:[["Gait and truncal ataxia, leg ataxia","bi"]]},
    {id:"vinf", n:"Cerebellar vermis, posterior and inferior (nodulus, uvula)", a:"Vi", k:"ctx", s:"M", sh:["p","M385.8,310.8 L498.3,319.2 L492.7,358.6 L470.2,386.8 L430.8,403.6 L402.7,392.4 L380.2,358.6 L371.7,336.1 Z"], fn:"Balance and eye movements", d:[["Truncal ataxia, nystagmus, vertigo","bi"]]}
  ],
  terr:[
    {id:"aca", n:"ACA (A2–A4): pericallosal and callosomarginal branches", f:"ACA", sh:["p","M-10.9,-32.4 L-10.9,403.6 L228.3,403.6 L228.3,248.9 L262.0,212.3 L383.0,206.7 L419.6,229.2 L478.6,122.3 L495.5,-32.4 Z"]},
    {id:"pca", n:"PCA (P3–P4): calcarine, parieto-occipital and posterior pericallosal branches", f:"PCA", sh:["p","M419.6,229.2 L478.6,122.3 L495.5,-32.4 L622.1,-32.4 L622.1,319.2 L383.0,248.9 L368.9,220.8 Z"]},
    {id:"acom", n:"Anterior communicating artery perforators (subcallosal and hypothalamic branches)", f:"ACAd", sh:["e",217.0,246.1,19.7,14.1]},
    {id:"tp", n:"Posteromedial central (thalamoperforating) arteries from P1 and the PComm", f:"PCAd", sh:["e",284.5,234.8,45.0,33.8]},
    {id:"shy", n:"Superior hypophyseal arteries (supraclinoid ICA)", f:"ICA", sh:["e",236.7,288.3,14.1,19.7]},
    {id:"spl", n:"Posterior pericallosal (splenial) artery (PCA)", f:"PCA", sh:["e",363.3,198.3,19.7,19.7]},
    {id:"quad", n:"Quadrigeminal (collicular) and posterior medial choroidal arteries (P1–P2)", f:"PCAd", sh:["e",343.6,243.3,14.1,25.3]},
    {id:"bas", n:"Basilar artery paramedian perforators (midbrain and pons)", f:"BA", sh:["p","M287.3,246.1 L298.6,293.9 L290.2,313.6 L290.2,341.8 L301.4,364.3 L332.4,372.7 L346.4,361.4 L363.3,358.6 L363.3,319.2 L360.5,291.1 L340.8,288.3 L323.9,237.7 Z"]},
    {id:"vert", n:"Vertebral artery and anterior spinal artery branches (medulla)", f:"VA", sh:["p","M332.4,372.7 L346.4,361.4 L363.3,358.6 L371.7,375.5 L380.2,403.6 L397.1,437.4 L368.9,443.0 L352.0,409.3 L340.8,389.6 Z"]},
    {id:"sca", n:"Superior cerebellar artery (superior vermis)", f:"SCA", sh:["p","M368.9,268.6 L391.4,243.3 L425.2,234.8 L459.0,251.7 L487.1,279.9 L498.3,313.6 L425.2,313.6 L385.8,305.2 Z"]},
    {id:"pica", n:"Posterior inferior cerebellar artery, medial branch (inferior vermis, nodulus)", f:"PICA", sh:["p","M385.8,310.8 L498.3,319.2 L492.7,358.6 L470.2,386.8 L430.8,403.6 L402.7,392.4 L380.2,358.6 L371.7,336.1 Z"]}
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
    {n:"Pineal region mass", sh:[["e",349.2,234.8,15.5,14.1]]},
    {n:"Ventral pontine infarct", sh:[["e",295.8,319.2,9.8,22.5]]},
    {n:"Paracentral ACA infarct", sh:[["e",326.7,60.4,28.1,19.7]]}
  ]
});

window.LOC_SLICES = S;
})();
