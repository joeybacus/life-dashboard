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
  id:"ax-vx", group:"Cerebrum", name:"Axial · vertex (centrum semiovale)", w:600, h:640, center:[162,309],
  view:"Axial, high convexity above the ventricles · front at the top",
  outline:"M26.0,365.3 L26.0,399.8 L34.6,412.8 L34.6,447.3 L38.9,451.6 L38.9,460.2 L56.2,481.8 L60.5,503.4 L82.1,525.0 L86.4,537.9 L136.0,583.2 L144.7,587.5 L174.9,587.5 L196.4,609.1 L205.1,609.1 L209.4,613.4 L235.3,613.4 L261.2,600.5 L274.1,600.5 L295.7,583.2 L304.3,583.2 L325.9,600.5 L338.8,600.5 L364.7,613.4 L390.6,613.4 L394.9,609.1 L403.6,609.1 L425.1,587.5 L455.3,587.5 L464.0,583.2 L513.6,537.9 L517.9,525.0 L539.5,503.4 L543.8,481.8 L561.1,460.2 L561.1,451.6 L565.4,447.3 L565.4,412.8 L574.0,399.8 L574.0,365.3 L565.4,352.4 L565.4,309.2 L548.1,287.6 L552.4,261.7 L539.5,231.5 L517.9,205.7 L517.9,197.0 L522.2,192.7 L517.9,188.4 L517.9,179.8 L505.0,158.2 L492.0,145.2 L487.7,128.0 L468.3,108.6 L455.3,104.3 L442.4,91.3 L425.1,87.0 L382.0,43.8 L373.4,43.8 L338.8,26.6 L325.9,26.6 L304.3,43.8 L295.7,43.8 L274.1,26.6 L261.2,26.6 L226.6,43.8 L218.0,43.8 L174.9,87.0 L157.6,91.3 L144.7,104.3 L131.7,108.6 L112.3,128.0 L108.0,145.2 L82.1,179.8 L82.1,188.4 L77.8,192.7 L82.1,197.0 L82.1,205.7 L60.5,231.5 L51.9,248.8 L51.9,257.4 L47.6,261.7 L51.9,287.6 L34.6,309.2 L34.6,352.4 Z",
  hemi:"M26.0,365.3 L26.0,399.8 L34.6,412.8 L34.6,447.3 L38.9,451.6 L38.9,460.2 L56.2,481.8 L60.5,503.4 L82.1,525.0 L86.4,537.9 L136.0,583.2 L144.7,587.5 L174.9,587.5 L196.4,609.1 L205.1,609.1 L209.4,613.4 L235.3,613.4 L261.2,600.5 L282.7,596.2 L297.8,581.1 L297.8,46.0 L282.7,30.9 L261.2,26.6 L226.6,43.8 L218.0,43.8 L174.9,87.0 L157.6,91.3 L144.7,104.3 L131.7,108.6 L112.3,128.0 L108.0,145.2 L82.1,179.8 L82.1,188.4 L77.8,192.7 L82.1,197.0 L82.1,205.7 L60.5,231.5 L51.9,248.8 L51.9,257.4 L47.6,261.7 L51.9,287.6 L34.6,309.2 L34.6,352.4 Z",
  inner:"M43.3,317.8 L43.3,326.5 L58.4,341.6 L79.9,337.3 L90.7,348.0 L90.7,373.9 L86.4,378.3 L90.7,408.5 L84.3,406.3 L56.2,443.0 L71.3,462.4 L90.7,447.3 L86.4,434.3 L92.9,427.9 L103.7,443.0 L112.3,464.6 L86.4,490.4 L114.5,518.5 L136.0,501.2 L183.5,553.0 L200.8,535.7 L222.3,553.0 L235.3,540.1 L269.8,570.3 L284.9,555.2 L284.9,546.5 L250.4,520.6 L254.7,494.8 L246.1,486.1 L246.1,473.2 L276.3,447.3 L261.2,432.2 L243.9,440.8 L233.1,438.7 L233.1,395.5 L250.4,378.3 L250.4,369.6 L280.6,343.7 L246.1,313.5 L280.6,287.6 L280.6,270.4 L272.0,261.7 L280.6,253.1 L280.6,240.2 L246.1,210.0 L250.4,197.0 L272.0,175.4 L259.0,140.9 L280.6,119.4 L280.6,93.5 L265.5,78.4 L248.2,91.3 L231.0,91.3 L213.7,78.4 L185.7,110.7 L207.2,136.6 L187.8,147.4 L179.2,147.4 L149.0,121.5 L129.6,140.9 L142.5,158.2 L142.5,166.8 L116.6,192.7 L138.2,210.0 L138.2,227.2 L131.7,233.7 L114.5,225.1 L88.6,225.1 L69.1,244.5 L60.5,261.7 L60.5,270.4 L82.1,292.0 L71.3,302.7 L62.7,298.4 Z",
  structs:[
    {id:"wmf", n:"Centrum semiovale: frontal association fibers (SLF I, frontal aslant tract)", a:"F-WM", k:"wm", sh:["p","M300.0,-165.4 L-109.9,-165.4 L-109.9,283.3 L41.1,292.0 L127.4,317.8 L170.6,339.4 L300.0,339.4 Z"], clip:"wm", fn:"Links SMA, premotor and prefrontal cortex", d:[["Reduced initiation and verbal fluency","bi"],["Transcortical motor aphasia (frontal aslant tract)","bi","L"]]},
    {id:"wmp", n:"Centrum semiovale: parietal association fibers", a:"P-WM", k:"wm", sh:["p","M300.0,339.4 L170.6,339.4 L127.4,317.8 L41.1,292.0 L-109.9,283.3 L-109.9,762.3 L300.0,762.3 Z"], clip:"wm", fn:"Parietal association and thalamocortical fibers", d:[["{C} cortical sensory loss","contra"],["{C} neglect","contra","R"]]},
    {id:"sma", n:"Supplementary motor area and pre-SMA (medial superior frontal gyrus)", a:"SMA", k:"ctx", sh:["p","M300.0,89.1 L243.9,89.1 L243.9,287.6 L300.0,287.6 Z"], clip:"ctx", fn:"Self-initiated and sequenced movement", d:[["{C} akinesia and leg-predominant weakness that improves over days","contra"],["Transcortical motor aphasia (sparse speech, repetition preserved)","bi","L"],["Alien hand with callosal involvement","contra"]]},
    {id:"pcl", n:"Paracentral lobule (leg motor and sensory cortex)", a:"PCL", k:"ctx", sh:["p","M300.0,287.6 L231.0,287.6 L231.0,373.9 L231.0,443.0 L300.0,443.0 Z"], clip:"ctx", fn:"Leg and foot movement and sensation; voluntary bladder control", d:[["{C} leg and foot weakness and sensory loss","contra"],["Urinary incontinence (more with both sides)","bi"]]},
    {id:"pcun", n:"Precuneus", a:"PCun", k:"ctx", sh:["p","M300.0,443.0 L231.0,443.0 L239.6,762.3 L300.0,762.3 Z"], clip:"ctx", fn:"Visuospatial imagery, self-awareness", d:[["Topographical disorientation","bi"]]},
    {id:"pfc", n:"Superior and middle frontal gyri (prefrontal convexity, frontal eye field)", a:"PFC", k:"ctx", sh:["p","M300.0,-165.4 L-109.9,-165.4 L-109.9,248.8 L62.7,253.1 L92.9,263.9 L138.2,269.5 L179.2,279.0 L205.1,287.6 L243.9,287.6 L243.9,89.1 L300.0,89.1 Z"], clip:"ctx", fn:"Executive function; voluntary saccades (posterior MFG)", d:[["Dysexecutive syndrome","bi"],["Eyes deviate toward the {I} side acutely","ipsi"]]},
    {id:"m1h", n:"Precentral gyrus: hand knob (primary motor cortex)", a:"M1", k:"ctx", sh:["p","M231.0,287.6 L205.1,287.6 L179.2,279.0 L138.2,269.5 L92.9,263.9 L62.7,253.1 L-109.9,248.8 L-109.9,283.3 L-2.0,283.3 L41.1,292.0 L92.9,304.9 L127.4,317.8 L144.7,348.0 L170.6,358.8 L205.1,365.3 L231.0,373.9 Z"], clip:"ctx", fn:"Hand and finger movement", d:[["{C} hand weakness, often finger extensors or ulnar fingers; can mimic a radial or ulnar nerve palsy","contra"]]},
    {id:"s1", n:"Postcentral gyrus (hand and arm sensation)", a:"S1", k:"ctx", sh:["p","M231.0,373.9 L205.1,365.3 L170.6,358.8 L144.7,348.0 L127.4,317.8 L92.9,304.9 L41.1,292.0 L-2.0,283.3 L-109.9,283.3 L-109.9,335.1 L-2.0,335.1 L45.4,343.7 L84.3,378.3 L123.1,399.8 L161.9,408.5 L187.8,417.1 L231.0,443.0 Z"], clip:"ctx", fn:"Discriminative touch and position", d:[["{C} astereognosis, agraphesthesia, impaired two-point discrimination and position sense in the hand","contra"]]},
    {id:"spl", n:"Superior parietal lobule", a:"SPL", k:"ctx", sh:["p","M231.0,443.0 L187.8,417.1 L161.9,408.5 L123.1,399.8 L84.3,378.3 L45.4,343.7 L-2.0,335.1 L-109.9,335.1 L-109.9,762.3 L239.6,762.3 Z"], clip:"ctx", fn:"Visually guided reaching, body schema", d:[["{C} optic ataxia","contra"],["{C} cortical sensory loss","contra"]]},
    {id:"csm", n:"Centrum semiovale: corticospinal fibers (leg medial, arm lateral)", a:"CS-m", k:"tract", sh:["e",209.4,317.8,28.0,51.8], fn:"Descending motor fibers from the precentral gyrus", d:[D.wkFAL]},
    {id:"slf", n:"Superior longitudinal fasciculus II", a:"SLF", k:"tract", sh:["e",157.6,330.8,19.4,73.4], fn:"Parietal to frontal attention network", d:[["{C} hemispatial neglect","contra","R"],["Ideomotor apraxia","bi","L"]]}
  ],
  terr:[
    {id:"mcas", n:"MCA superior division (M4): prerolandic, rolandic and anterior parietal branches", f:"MCA", sh:["p","M196.4,-165.4 L-109.9,-165.4 L-109.9,395.5 L127.4,417.1 L196.4,417.1 Z"]},
    {id:"mcap", n:"MCA posterior parietal branch (inferior division, M4)", f:"MCA", sh:["p","M196.4,417.1 L127.4,417.1 L-109.9,395.5 L-109.9,762.3 L170.6,762.3 L170.6,654.4 L222.3,568.1 L196.4,481.8 Z"]},
    {id:"aca", n:"ACA (A3–A4): callosomarginal (paracentral, superior frontal) and pericallosal (precuneal) branches", f:"ACA", sh:["p","M300.0,-165.4 L196.4,-165.4 L196.4,481.8 L222.3,568.1 L300.0,589.7 Z"]},
    {id:"pca", n:"PCA (P4): parieto-occipital branch", f:"PCA", sh:["p","M300.0,589.7 L222.3,568.1 L170.6,654.4 L170.6,762.3 L300.0,762.3 Z"]},
    {id:"ws", n:"ACA–MCA border zone (parasagittal watershed)", f:"WS", sh:["p","M213.7,-165.4 L174.9,-165.4 L174.9,503.4 L213.7,503.4 Z"], clip:"hemi"},
    {id:"med", n:"MCA medullary (superficial perforating) arteries; a chain of small lesions here is the internal border zone", f:"MCAd", sh:["e",192.1,296.3,25.9,138.1]}
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
    {n:"Left hand knob", sh:[["e",528.7,279.0,19.4,19.4]]},
    {n:"Right paracentral lobule (ACA)", sh:[["e",274.1,348.0,21.6,43.1]]},
    {n:"Bilateral watershed chains", sh:[["e",192.1,235.9,11.2,11.2],["e",192.1,283.3,11.2,11.2],["e",196.4,330.8,11.2,11.2],["e",407.9,235.9,11.2,11.2],["e",407.9,283.3,11.2,11.2],["e",403.6,330.8,11.2,11.2]]}
  ]
});

/* ---------------- Axial · midbrain and temporal lobes ---------------- */
S.push({
  id:"ax-ml", group:"Cerebrum", name:"Axial · midbrain and temporal lobes", w:600, h:660, center:[187,325],
  view:"Axial, through the suprasellar cistern, midbrain and medial temporal lobes · front at the top", outline:"M44.6,345.9 L51.6,423.4 L76.3,490.3 L90.4,511.4 L104.5,525.5 L111.5,543.1 L118.6,550.2 L129.1,571.3 L176.7,615.3 L226.0,640.0 L254.2,640.0 L278.9,618.9 L289.4,615.3 L296.5,608.3 L303.5,608.3 L310.6,615.3 L321.1,618.9 L345.8,640.0 L374.0,640.0 L391.6,633.0 L398.6,625.9 L412.7,622.4 L440.9,601.2 L470.9,571.3 L481.4,550.2 L488.5,543.1 L495.5,525.5 L509.6,511.4 L527.2,483.2 L527.2,476.2 L534.3,465.6 L534.3,458.6 L548.4,423.4 L551.9,370.5 L555.4,367.0 L555.4,345.9 L551.9,342.3 L551.9,321.2 L548.4,317.7 L548.4,310.6 L534.3,282.4 L527.2,275.4 L527.2,268.4 L516.6,250.7 L516.6,243.7 L506.1,219.0 L481.4,197.9 L481.4,187.3 L495.5,148.6 L495.5,134.5 L492.0,131.0 L492.0,123.9 L481.4,109.8 L477.9,95.7 L463.8,81.6 L456.8,67.6 L430.3,44.7 L402.2,34.1 L370.5,30.6 L359.9,23.5 L349.3,23.5 L345.8,20.0 L317.6,20.0 L300.0,34.1 L282.4,20.0 L254.2,20.0 L250.7,23.5 L240.1,23.5 L229.5,30.6 L197.8,34.1 L194.3,37.6 L176.7,41.1 L159.1,51.7 L143.2,67.6 L136.2,81.6 L122.1,95.7 L118.6,109.8 L108.0,123.9 L108.0,131.0 L104.5,134.5 L104.5,148.6 L118.6,187.3 L118.6,197.9 L93.9,219.0 L83.4,243.7 L83.4,250.7 L72.8,268.4 L72.8,275.4 L65.7,282.4 L51.6,310.6 L51.6,317.7 L48.1,321.2 L48.1,342.3 Z", hemi:"M44.6,345.9 L51.6,423.4 L65.7,458.6 L65.7,465.6 L72.8,476.2 L76.3,490.3 L90.4,511.4 L104.5,525.5 L111.5,543.1 L118.6,550.2 L129.1,571.3 L176.7,615.3 L226.0,640.0 L254.2,640.0 L278.9,618.9 L289.4,615.3 L298.2,606.5 L298.2,32.3 L289.4,23.5 L282.4,20.0 L254.2,20.0 L250.7,23.5 L240.1,23.5 L229.5,30.6 L197.8,34.1 L169.7,44.7 L143.2,67.6 L136.2,81.6 L122.1,95.7 L118.6,109.8 L108.0,123.9 L108.0,131.0 L104.5,134.5 L104.5,148.6 L118.6,187.3 L118.6,197.9 L93.9,219.0 L83.4,243.7 L83.4,250.7 L72.8,268.4 L72.8,275.4 L65.7,282.4 L51.6,310.6 L51.6,317.7 L48.1,321.2 L48.1,342.3 Z", inner:"M227.8,338.8 L250.7,365.2 L257.7,365.2 L278.9,386.4 L298.2,370.5 L298.2,331.8 L284.1,314.1 L294.7,300.1 L282.4,287.7 L275.3,294.8 L247.2,270.1 L234.8,282.4 L241.9,289.5 L238.4,293.0 L241.9,310.6 Z M86.9,374.0 L111.5,398.7 L108.0,426.9 L123.9,442.7 L141.5,425.1 L157.3,437.4 L160.9,465.6 L146.8,479.7 L153.8,497.3 L153.8,511.4 L146.8,522.0 L176.7,548.4 L187.3,537.8 L197.8,541.4 L210.2,525.5 L203.1,511.4 L206.6,493.8 L192.6,458.6 L196.1,437.4 L171.4,416.3 L171.4,405.7 L182.0,395.2 L160.9,374.0 L160.9,363.5 L164.4,352.9 L203.1,317.7 L199.6,300.1 L220.7,278.9 L206.6,264.8 L220.7,243.7 L224.3,229.6 L233.1,220.8 L254.2,227.8 L277.1,208.5 L263.0,148.6 L277.1,123.9 L263.0,106.3 L284.1,85.2 L284.1,78.1 L277.1,71.1 L280.6,57.0 L268.3,44.7 L254.2,58.8 L236.6,55.2 L222.5,62.3 L208.4,48.2 L201.4,48.2 L187.3,62.3 L176.7,55.2 L132.7,106.3 L139.7,120.4 L125.6,134.5 L139.7,152.1 L132.7,162.7 L132.7,180.3 L145.0,192.6 L166.1,182.0 L197.8,189.1 L206.6,197.9 L206.6,204.9 L185.5,226.1 L167.9,261.3 L167.9,296.5 L164.4,303.6 L155.6,312.4 L148.5,308.9 L118.6,345.9 L122.1,349.4 L109.8,361.7 L99.2,361.7 Z M150.3,574.8 L166.1,590.7 L173.2,590.7 L194.3,615.3 L204.9,615.3 L226.0,629.4 L240.1,629.4 L252.4,617.1 L252.4,606.5 L240.1,594.2 L219.0,601.2 L210.2,592.4 L224.3,578.4 L211.9,566.0 L187.3,562.5 L173.2,551.9 Z",
  structs:[
    {id:"wmf", n:"Orbitofrontal white matter", a:"F-WM", k:"wm", sh:["p","M300.0,-62.8 L-34.7,-62.8 L-34.7,194.4 L159.1,215.5 L229.5,222.6 L300.0,222.6 Z"], clip:"wm", fn:"Orbitofrontal connections", d:[["Disinhibition, apathy","bi"]]},
    {id:"wmo", n:"Occipital white matter (ventral optic radiation)", a:"O-WM", k:"wm", sh:["p","M300.0,448.0 L-34.7,483.2 L-34.7,694.6 L300.0,694.6 Z"], clip:"wm", fn:"Lower optic radiation fibers", d:[["{C} superior quadrantanopia or hemianopia","contra"]]},
    {id:"wmt", n:"Temporal white matter (Meyer loop, uncinate, inferior longitudinal fasciculus)", a:"T-WM", k:"wm", sh:["p","M208.4,222.6 L-34.7,194.4 L-34.7,483.2 L159.1,465.6 L173.2,377.6 L194.3,300.1 Z"], clip:"wm", fn:"Visual radiation loop and temporal association fibers", d:[["{C} superior quadrantanopia (Meyer loop)","contra"],["Naming and semantic deficits","bi","L"]]},
    {id:"wmh", n:"Perihippocampal white matter (fimbria, cingulum, wall of the temporal horn)", a:"pH-WM", k:"wm", sh:["e",197.8,345.9,31.7,52.8,12], clip:"wm", fn:"Hippocampal output and limbic connections", d:[["Memory impairment","bi"]]},
    {id:"ofc", n:"Gyrus rectus and medial orbitofrontal cortex", a:"OFC", k:"ctx", sh:["p","M300.0,-62.8 L229.5,-62.8 L229.5,222.6 L300.0,222.6 Z"], clip:"ctx", fn:"Social behaviour, reward, inhibition", d:[["Disinhibition, impulsivity, poor judgment","bi"]]},
    {id:"lofc", n:"Lateral orbitofrontal cortex and pars orbitalis", a:"lOFC", k:"ctx", sh:["p","M229.5,-62.8 L-34.7,-62.8 L-34.7,194.4 L159.1,215.5 L229.5,222.6 Z"], clip:"ctx", fn:"Emotional regulation; semantic retrieval (left)", d:[["Personality change, poor judgment","bi"]]},
    {id:"tp", n:"Temporal pole and anterior temporal lobe", a:"TP", k:"ctx", sh:["p","M159.1,215.5 L-34.7,194.4 L-34.7,324.7 L166.1,314.1 L194.3,293.0 L222.5,257.8 L229.5,222.6 Z"], clip:"ctx", fn:"Semantic memory, social knowledge", d:[["Semantic deficits: loss of word meaning and object knowledge","bi","L"],["Loss of person knowledge, behavioural change","bi","R"]]},
    {id:"itg", n:"Middle and inferior temporal gyri", a:"ITG", k:"ctx", sh:["p","M166.1,314.1 L-34.7,324.7 L-34.7,490.3 L152.0,483.2 L166.1,412.8 Z"], clip:"ctx", fn:"Semantic and visual object memory", d:[["Anomia","bi","L"],["Visual memory difficulties","bi","R"]]},
    {id:"fus", n:"Fusiform gyrus (ventral temporo-occipital)", a:"Fus", k:"ctx", sh:["p","M173.2,391.6 L166.1,412.8 L152.0,483.2 L-34.7,490.3 L-34.7,553.7 L194.3,553.7 L208.4,430.4 Z"], clip:"ctx", fn:"Faces (right), written words (left), colour", d:[["Prosopagnosia (worse with both sides)","bi","R"],["Pure alexia (visual word form area)","bi","L"],["{C} hemiachromatopsia","contra"]]},
    {id:"lin", n:"Lingual gyrus and lower calcarine cortex (V1)", a:"Lin", k:"ctx", sh:["p","M300.0,483.2 L208.4,448.0 L194.3,553.7 L-34.7,553.7 L-34.7,694.6 L300.0,694.6 Z"], clip:"ctx", fn:"Upper visual field; colour (V4)", d:[["{C} superior homonymous quadrantanopia","contra"],["Achromatopsia if both sides","bi"]]},
    {id:"phg", n:"Posterior parahippocampal gyrus", a:"PHG", k:"ctx", sh:["p","M250.7,377.6 L208.4,377.6 L173.2,391.6 L208.4,430.4 L208.4,448.0 L300.0,483.2 L300.0,430.4 L257.7,412.8 Z"], clip:"ctx", fn:"Scene memory and navigation", d:[["Topographic agnosia (getting lost)","bi"]]},
    {id:"olf", n:"Olfactory tract", a:"Olf", k:"tract", sh:["e",268.3,166.2,6.3,31.7], fn:"Smell", d:[["{I} anosmia","ipsi"]]},
    {id:"vs", n:"Ventral striatum (nucleus accumbens)", a:"NAc", k:"nuc", sh:["e",264.8,229.6,14.1,10.6], fn:"Reward and motivation", d:[["Apathy, reduced motivation","bi"]]},
    {id:"bf", n:"Basal forebrain (nucleus basalis, substantia innominata)", a:"BF", k:"nuc", sh:["e",247.2,254.3,21.1,8.8], fn:"Cholinergic projection to cortex and hippocampus", d:[["Amnesia with confabulation (often after ACoA aneurysm rupture)","bi"]]},
    {id:"amyg", n:"Amygdala", a:"Amy", k:"nuc", sh:["e",211.9,268.4,19.4,15.9], fn:"Fear, emotional memory, social signals", d:[["Reduced fear and emotional memory; with both sides, Klüver–Bucy syndrome","bi"]]},
    {id:"unc", n:"Uncus and entorhinal cortex", a:"Unc", k:"ctx", sh:["e",220.7,300.1,15.9,14.1], fn:"Gateway to the hippocampus; olfactory cortex", d:[["Memory impairment; olfactory auras in seizures","bi"]]},
    {id:"th", n:"Temporal horn", a:"TH", k:"csf", sh:["e",169.7,356.4,5.6,21.1], d:[]},
    {id:"hip", n:"Hippocampus (head and body)", a:"Hip", k:"ctx", sh:["e",199.6,352.9,19.4,38.8,12], fn:"Episodic memory", d:[D.amnesia]},
    {id:"ot", n:"Optic tract", a:"OT", k:"tract", sh:["e",252.4,289.5,21.1,5.6,-35], fn:"Retinal fibers to the lateral geniculate", d:[["{C} incongruous homonymous hemianopia with an RAPD in the {C} eye","contra"]]},
    {id:"crus", n:"Cerebral peduncle", a:"CP", k:"tract", sh:["p","M282.4,314.1 L264.8,308.9 L240.1,310.6 L231.3,317.7 L229.5,335.3 L233.1,349.4 L250.7,352.9 L268.3,342.3 L282.4,328.2 Z"], fn:"Corticospinal and corticobulbar fibers", d:[D.wkFAL]},
    {id:"mteg", n:"Midbrain tegmentum (red nucleus, CN III nucleus, reticular formation)", a:"Teg", k:"nuc", sh:["p","M300.0,331.8 L282.4,328.2 L268.3,342.3 L250.7,352.9 L233.1,351.1 L240.1,363.5 L254.2,372.3 L264.8,381.1 L300.0,381.1 Z"], fn:"Third nerve, cerebellar output, arousal", d:[["{I} third nerve palsy","ipsi"],["{C} ataxia or tremor","contra"],["Reduced consciousness if both sides","bi","BOTH"]]},
    {id:"hy", n:"Hypothalamus", a:"Hy", k:"nuc", s:"M", sh:["e",300.0,278.9,21.1,14.1], fn:"Temperature, appetite, thirst, sleep, endocrine and autonomic control", d:[["Diabetes insipidus, temperature and appetite disturbance, hypopituitarism","bi"]]},
    {id:"mb", n:"Mammillary bodies", a:"MB", k:"nuc", s:"M", sh:["e",300.0,301.8,15.9,7.0], fn:"Papez circuit", d:[["Anterograde amnesia (Korsakoff)","bi"]]},
    {id:"och", n:"Optic chiasm", a:"OCh", k:"tract", s:"M", sh:["e",300.0,250.7,28.2,7.0], fn:"Crossing nasal retinal fibers", d:[["Bitemporal hemianopia","bi"]]},
    {id:"ipc", n:"Interpeduncular cistern", a:"IPC", k:"csf", s:"M", sh:["e",300.0,317.7,8.8,7.0], d:[]},
    {id:"aq", n:"Cerebral aqueduct", a:"Aq", k:"csf", s:"M", sh:["e",300.0,390.9,5.3,5.3], d:[["Obstruction causes hydrocephalus","bi"]]},
    {id:"tect", n:"Tectum (superior colliculi, pretectum)", a:"Tect", k:"nuc", s:"M", sh:["e",300.0,396.9,28.2,12.3], fn:"Vertical gaze and pupillary reflexes", d:[["Upgaze palsy, light-near dissociation (Parinaud)","bi"]]},
    {id:"verm", n:"Superior cerebellar vermis (culmen)", a:"Vs", k:"ctx", s:"M", sh:["p","M356.4,419.8 L328.2,414.5 L300.0,416.3 L271.8,414.5 L243.6,419.8 L236.6,455.1 L247.2,497.3 L271.8,518.5 L300.0,522.0 L328.2,518.5 L352.8,497.3 L363.4,455.1 Z"], fn:"Gait and posture", d:[["Gait and truncal ataxia","bi"]]}
  ],
  terr:[
    {id:"mca", n:"MCA (M2–M3): lateral orbitofrontal and middle temporal branches", f:"MCA", sh:["p","M222.5,-62.8 L-34.7,-62.8 L-34.7,490.3 L130.9,465.6 L145.0,342.3 L173.2,300.1 L215.5,229.6 Z"]},
    {id:"ata", n:"Anterior temporal artery (from M1)", f:"MCA", sh:["p","M173.2,215.5 L-34.7,194.4 L-34.7,321.2 L152.0,307.1 L180.2,278.9 Z"]},
    {id:"aca", n:"ACA (A2): orbitofrontal and frontopolar branches", f:"ACA", sh:["p","M300.0,-62.8 L222.5,-62.8 L215.5,229.6 L300.0,229.6 Z"]},
    {id:"pca", n:"PCA (P2–P4): anterior and posterior temporal, hippocampal and calcarine branches", f:"PCA", sh:["p","M300.0,229.6 L215.5,229.6 L173.2,300.1 L145.0,342.3 L130.9,465.6 L-34.7,490.3 L-34.7,694.6 L300.0,694.6 Z"]},
    {id:"phip", n:"PCA hippocampal and anterior temporal branches (P2): hippocampus, parahippocampal gyrus", f:"PCA", sh:["e",199.6,352.9,26.4,45.8,12]},
    {id:"amyg", n:"Anterior choroidal artery and uncal branch of M1: amygdala", f:"AChA", sh:["e",211.9,271.9,24.7,21.1]},
    {id:"heub", n:"Recurrent artery of Heubner and medial lenticulostriate arteries (A1): accumbens, basal forebrain", f:"ACAd", sh:["e",257.7,236.6,24.7,17.6]},
    {id:"acha", n:"Anterior choroidal artery (ICA): uncus, medial amygdala, hippocampal head, optic tract", f:"AChA", sh:["p","M257.7,282.4 L236.6,293.0 L215.5,278.9 L201.4,300.1 L208.4,321.2 L229.5,321.2 L243.6,303.6 Z"]},
    {id:"shy", n:"Superior hypophyseal arteries (ICA): optic chiasm", f:"ICA", sh:["e",285.9,250.7,21.1,10.6]},
    {id:"pcom", n:"Premammillary (thalamotuberal) and hypothalamic perforators of the posterior communicating artery", f:"PCom", sh:["e",285.9,293.0,17.6,14.1]},
    {id:"pmed", n:"Paramedian mesencephalic perforators (P1 and basilar tip)", f:"PCAd", sh:["p","M300.0,314.1 L278.9,314.1 L268.3,342.3 L268.3,381.1 L300.0,381.1 Z"]},
    {id:"pcirc", n:"Short circumferential branches of P1–P2 (peduncular rami)", f:"PCAd", sh:["p","M278.9,314.1 L240.1,310.6 L229.5,331.8 L233.1,352.9 L250.7,370.5 L268.3,381.1 L268.3,342.3 Z"]},
    {id:"coll", n:"Collicular (quadrigeminal) artery (P1)", f:"PCAd", sh:["e",285.9,398.7,21.1,14.1]},
    {id:"sca", n:"Superior cerebellar artery: superior vermis", f:"SCA", sh:["p","M300.0,416.3 L271.8,414.5 L243.6,419.8 L236.6,455.1 L247.2,497.3 L271.8,518.5 L300.0,522.0 Z"]}
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
    {n:"Right hippocampal (PCA) infarct", sh:[["e",199.6,352.9,15.9,31.7,12]]},
    {n:"Left anterior choroidal territory", sh:[["p","M331.7,275.4 L352.8,286.0 L374.0,278.9 L388.1,293.0 L384.5,307.1 L366.9,312.4 L349.3,300.1 Z"]]},
    {n:"Both amygdalae and temporal poles", sh:[["e",180.2,257.8,42.3,28.2],["e",419.8,257.8,42.3,28.2]]},
    {n:"Left fusiform gyrus", sh:[["e",409.2,433.9,17.6,21.1]]}
  ]
});

/* ---------------- Coronal · anterior ---------------- */
S.push({
  id:"cor-a", group:"Cerebrum", name:"Coronal · anterior (caudate head)", w:600, h:500, center:[192,272],
  view:"Coronal, through the caudate head, anterior limb and anterior commissure · top of the head up",
  outline:"M60.8,206.8 L60.8,253.6 L71.6,278.8 L68.0,296.8 L64.4,300.4 L68.0,329.1 L71.6,332.7 L68.0,386.7 L75.2,397.5 L82.4,422.7 L123.8,467.6 L138.1,474.8 L163.3,474.8 L177.7,482.0 L199.3,482.0 L213.7,474.8 L229.9,455.0 L229.9,440.6 L247.8,393.9 L247.8,372.3 L260.4,359.7 L289.2,359.7 L300.0,352.5 L310.8,359.7 L339.6,359.7 L352.2,372.3 L352.2,393.9 L370.1,440.6 L370.1,455.0 L386.3,474.8 L400.7,482.0 L422.3,482.0 L436.7,474.8 L461.9,474.8 L476.2,467.6 L521.2,415.5 L524.8,397.5 L532.0,386.7 L528.4,332.7 L532.0,329.1 L535.6,300.4 L532.0,296.8 L528.4,278.8 L539.2,253.6 L539.2,206.8 L535.6,203.2 L535.6,188.9 L532.0,185.3 L528.4,160.1 L517.6,145.7 L499.6,109.7 L479.8,89.9 L465.5,82.7 L443.9,61.2 L429.5,54.0 L415.1,54.0 L407.9,50.4 L393.5,32.4 L379.1,25.2 L328.8,18.0 L325.2,21.6 L318.0,21.6 L300.0,36.0 L282.0,21.6 L256.8,18.0 L253.2,21.6 L220.9,25.2 L206.5,32.4 L192.1,50.4 L184.9,54.0 L170.5,54.0 L156.1,61.2 L100.4,109.7 L82.4,145.7 L71.6,160.1 L68.0,185.3 L64.4,188.9 L64.4,203.2 Z",
  hemi:"M60.8,206.8 L60.8,253.6 L71.6,278.8 L68.0,296.8 L64.4,300.4 L68.0,329.1 L71.6,332.7 L68.0,386.7 L75.2,397.5 L82.4,422.7 L123.8,467.6 L138.1,474.8 L163.3,474.8 L177.7,482.0 L199.3,482.0 L213.7,474.8 L229.9,455.0 L229.9,440.6 L247.8,393.9 L247.8,372.3 L260.4,359.7 L289.2,359.7 L298.2,354.3 L298.2,34.2 L282.0,21.6 L274.8,21.6 L271.2,18.0 L235.3,21.6 L206.5,32.4 L197.5,45.0 L184.9,54.0 L170.5,54.0 L156.1,61.2 L134.5,82.7 L120.2,89.9 L93.2,120.5 L82.4,145.7 L71.6,160.1 L68.0,185.3 L64.4,188.9 L64.4,203.2 Z",
  inner:"M71.6,210.4 L71.6,235.6 L84.2,248.2 L91.4,244.6 L100.4,253.6 L100.4,260.8 L113.0,273.4 L116.6,269.8 L122.0,278.8 L114.8,311.1 L122.0,332.7 L118.4,375.9 L125.6,393.9 L116.6,402.9 L109.4,395.7 L96.8,408.3 L109.4,420.9 L123.8,406.5 L174.1,438.8 L208.3,408.3 L208.3,401.1 L197.5,390.3 L197.5,372.3 L201.1,354.3 L210.1,341.7 L220.9,330.9 L246.0,338.1 L260.4,334.5 L271.2,330.9 L285.6,316.5 L298.2,314.7 L298.2,196.0 L283.8,185.3 L287.4,178.1 L283.8,163.7 L258.6,142.1 L280.2,120.5 L262.2,98.9 L265.8,73.8 L280.2,52.2 L267.6,39.6 L246.0,61.2 L242.4,57.6 L229.9,70.2 L229.9,80.9 L210.1,97.1 L197.5,77.3 L181.3,61.2 L174.1,61.2 L157.9,77.3 L165.1,95.3 L156.1,104.3 L145.3,93.5 L134.5,93.5 L100.4,127.7 L113.0,140.3 L123.8,140.3 L134.5,133.1 L141.7,133.1 L143.5,138.5 L120.2,176.3 L95.0,158.3 L78.8,174.5 L86.0,188.9 L75.2,199.6 Z",
  structs:[
    {id:"cr", n:"Corona radiata (anterior: frontal projection fibers, anterior thalamic radiation)", a:"CR", k:"wm", sh:["w",290,90], clip:"wm", fn:"Frontal connections and descending fibers", d:[["Abulia, executive dysfunction","bi"],["{C} face and arm weakness if posterior fibers are involved","contra"]]},
    {id:"tstem", n:"Temporal stem (uncinate and inferior fronto-occipital fasciculi)", a:"TS", k:"wm", sh:["w",180,290], clip:"wm", fn:"Frontal to temporal connections", d:[["Semantic and naming deficits","bi","L"],["Behavioural change","bi","R"]]},
    {id:"sfg", n:"Superior frontal gyrus (medial: pre-SMA)", a:"SFG", k:"ctx", sh:["w",0,60], clip:"ctx", fn:"Initiation of action and speech", d:[["Abulia; transcortical motor aphasia if dominant","bi"],["{C} leg weakness","contra"]]},
    {id:"mfg", n:"Middle frontal gyrus (dorsolateral prefrontal cortex)", a:"MFG", k:"ctx", sh:["w",320,360], clip:"ctx", fn:"Executive control, working memory", d:[["Dysexecutive syndrome","bi"]]},
    {id:"ifg", n:"Inferior frontal gyrus (Broca area on the left)", a:"IFG", k:"ctx", sh:["w",285,320], clip:"ctx", fn:"Speech production; prosody (right)", d:[["Broca (nonfluent) aphasia with apraxia of speech","bi","L"],["Expressive aprosodia","bi","R"]]},
    {id:"stg", n:"Anterior superior temporal gyrus and temporal pole", a:"aSTG", k:"ctx", sh:["w",240,285], clip:"ctx", fn:"Auditory association, semantic memory", d:[["Semantic deficits","bi","L"]]},
    {id:"itg", n:"Anterior middle and inferior temporal gyri", a:"aITG", k:"ctx", sh:["w",195,240], clip:"ctx", fn:"Semantic memory", d:[["Anomia","bi","L"]]},
    {id:"cing", n:"Anterior cingulate gyrus", a:"ACC", k:"ctx", sh:["e",283.8,161.9,15.1,19.8], fn:"Motivation, error monitoring", d:[["Apathy; akinetic mutism if both sides","bi"]]},
    {id:"lv", n:"Lateral ventricle, frontal horn", a:"FH", k:"csf", sh:["p","M242.4,196.0 L256.8,199.6 L278.4,210.4 L295.7,217.6 L297.1,257.2 L294.6,291.4 L284.9,291.4 L278.4,271.6 L273.4,250.0 L267.6,233.8 L260.4,219.4 L247.8,205.0 Z"], d:[]},
    {id:"cau", n:"Caudate head", a:"Cd", k:"nuc", sh:["p","M243.5,195.3 L229.9,201.4 L228.1,228.4 L238.9,259.0 L253.2,275.2 L269.4,287.8 L284.2,291.0 L278.4,271.6 L273.4,250.0 L267.6,233.8 L260.4,219.4 L247.8,205.0 Z"], fn:"Associative and limbic loops", d:[["Abulia, apathy, disinhibition","bi"],["{C} chorea (rare)","contra"]]},
    {id:"alic", n:"Anterior limb of the internal capsule", a:"ALIC", k:"tract", sh:["p","M229.9,201.4 L222.7,206.8 L215.5,228.4 L220.9,253.6 L233.5,273.4 L249.6,287.4 L267.6,292.4 L269.4,287.8 L253.2,275.2 L238.9,259.0 L228.1,228.4 Z"], fn:"Frontopontine fibers and anterior thalamic radiation", d:[["Abulia, executive dysfunction","bi"],["Mild {C} face and arm weakness","contra"]]},
    {id:"ins", n:"Insular cortex (anterior)", a:"Ins", k:"ctx", sh:["p","M170.5,214.0 L179.5,242.8 L181.3,278.8 L179.5,314.7 L174.1,336.3 L159.7,332.7 L150.7,304.0 L148.9,264.4 L152.5,232.0 L159.7,210.4 Z"], fn:"Speech planning, interoception, taste", d:[["Apraxia of speech","bi","L"],["Autonomic disturbance","bi","R"]]},
    {id:"ext", n:"External capsule and claustrum", a:"EC", k:"wm", sh:["p","M210.1,224.8 L190.3,242.8 L181.3,275.2 L182.0,314.7 L192.1,332.7 L206.5,329.1 L190.3,307.6 L187.4,275.2 L197.5,246.4 L215.5,228.4 Z"], fn:"Corticocortical fibers", d:[["Often silent","bi"]]},
    {id:"put", n:"Putamen", a:"Put", k:"nuc", sh:["p","M213.0,228.4 L201.1,239.2 L190.3,260.8 L186.7,282.4 L188.5,304.0 L193.9,321.9 L201.1,327.3 L215.5,318.3 L219.1,300.4 L222.7,278.8 L222.7,257.2 L219.1,239.2 Z"], fn:"Motor and associative striatum", d:[["{C} dystonia or hemichorea","contra"],["{C} hemiparesis if the capsule is involved","contra"]]},
    {id:"gpe", n:"Globus pallidus (externa)", a:"GPe", k:"nuc", sh:["p","M224.5,260.8 L222.3,278.8 L218.7,300.4 L215.8,316.9 L231.7,318.3 L246.0,313.3 L246.0,296.8 L235.3,278.8 Z"], fn:"Indirect pathway", d:[["{C} dystonia","contra"]]},
    {id:"nac", n:"Nucleus accumbens (ventral striatum)", a:"NAc", k:"nuc", sh:["e",262.2,300.4,14.4,10.1], fn:"Reward and motivation", d:[["Apathy","bi"]]},
    {id:"bf", n:"Basal forebrain (nucleus basalis of Meynert, substantia innominata)", a:"BF", k:"nuc", sh:["e",249.6,337.8,28.8,7.2], fn:"Cholinergic projection to cortex", d:[["Amnesia with confabulation","bi"]]},
    {id:"amyg", n:"Amygdala", a:"Amy", k:"nuc", sh:["e",220.9,383.1,23.4,21.6], fn:"Fear and emotional memory", d:[["Reduced fear; Klüver–Bucy if both sides","bi"]]},
    {id:"cc", n:"Corpus callosum (genu and body)", a:"CC", k:"tract", s:"M", sh:["p","M361.1,185.3 L332.4,183.5 L300.0,186.7 L267.6,183.5 L238.9,185.3 L238.9,196.0 L253.2,197.5 L267.6,203.2 L285.6,210.4 L300.0,212.6 L314.4,210.4 L332.4,203.2 L346.8,197.5 L361.1,196.0 Z"], fn:"Connects the frontal lobes", d:[["Callosal disconnection: left-hand apraxia, alien hand","bi"]]},
    {id:"sept", n:"Septum pellucidum and septal nuclei", a:"Sep", k:"nuc", s:"M", sh:["p","M303.6,214.0 L296.4,214.0 L296.4,289.6 L303.6,289.6 Z"], fn:"Limbic relay", d:[["Memory and emotional change","bi"]]},
    {id:"fx", n:"Fornix (columns)", a:"Fx", k:"tract", s:"M", sh:["e",300.0,296.8,11.5,9.4], fn:"Hippocampal output", d:[["Anterograde amnesia","bi"]]},
    {id:"ac", n:"Anterior commissure", a:"AC", k:"tract", s:"M", sh:["p","M379.1,316.2 L343.2,310.4 L300.0,306.1 L256.8,310.4 L220.9,316.2 L220.9,324.8 L256.8,319.1 L300.0,314.7 L343.2,319.1 L379.1,324.8 Z"], fn:"Connects the temporal lobes and olfactory structures", d:[["Rarely symptomatic alone","bi"]]},
    {id:"hy", n:"Hypothalamus (preoptic and anterior)", a:"Hy", k:"nuc", s:"M", sh:["e",300.0,334.5,19.8,11.5], fn:"Temperature (heat loss), sleep onset, fluid balance", d:[["Hyperthermia, insomnia, diabetes insipidus","bi"]]},
    {id:"och", n:"Optic chiasm", a:"OCh", k:"tract", s:"M", sh:["e",300.0,357.2,30.6,6.1], fn:"Crossing nasal fibers", d:[["Bitemporal hemianopia","bi"]]}
  ],
  terr:[
    {id:"mcas", n:"MCA superior division (M2–M4): prefrontal and opercular branches", f:"MCA", sh:["w",280,360]},
    {id:"mcat", n:"MCA temporal branches, including the anterior temporal artery (M1)", f:"MCA", sh:["w",200,280]},
    {id:"aca", n:"ACA (A2–A3): pericallosal and callosomarginal branches", f:"ACA", sh:["w",0,80]},
    {id:"pcat", n:"PCA anterior temporal branch (P2)", f:"PCA", sh:["w",150,200]},
    {id:"ws", n:"Anterior watershed: ACA–MCA cortical border zone", f:"WS", sh:["w",345,8], clip:"ctx"},
    {id:"lsa", n:"Lateral lenticulostriate arteries (M1 MCA): putamen, globus pallidus externa, upper capsule", f:"MCAd", sh:["p","M242.4,192.4 L220.9,203.2 L199.3,232.0 L184.9,264.4 L184.9,307.6 L195.7,329.1 L220.9,321.9 L235.3,293.2 L242.4,264.4 Z"]},
    {id:"heub", n:"Recurrent artery of Heubner (A1–A2 junction): caudate head, anterior limb, anterior putamen", f:"ACAd", sh:["p","M243.5,196.0 L228.1,206.8 L222.7,242.8 L238.9,271.6 L246.0,300.4 L256.8,318.3 L278.4,314.7 L283.8,293.2 L278.4,264.4 L271.2,235.6 L260.4,214.0 Z"]},
    {id:"mlsa", n:"Medial lenticulostriate arteries (A1): accumbens, anterior hypothalamus, basal forebrain", f:"ACAd", sh:["p","M249.6,307.6 L235.3,278.8 L220.9,286.0 L215.5,318.3 L228.1,325.5 L256.8,325.5 L267.6,314.7 Z"]},
    {id:"acha", n:"Anterior choroidal artery (ICA): amygdala, uncus", f:"AChA", sh:["e",224.5,372.3,28.8,25.2]},
    {id:"acom", n:"Anterior communicating artery perforators: septum, fornix columns, anterior hypothalamus", f:"ACAd", sh:["e",291.0,300.4,12.6,43.2]},
    {id:"shy", n:"Superior hypophyseal arteries (ICA): optic chiasm", f:"ICA", sh:["e",289.2,350.7,18.0,10.8]}
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
    {n:"Right Heubner (caudate head and anterior limb)", sh:[["p","M246.0,197.8 L228.1,206.8 L222.7,235.6 L235.3,264.4 L253.2,282.4 L271.2,289.6 L278.4,271.6 L273.0,246.4 L264.0,221.2 Z"]]},
    {n:"Left inferior frontal gyrus (Broca)", sh:[["e",515.8,221.2,18.0,21.6]]},
    {n:"Basal forebrain and septum (ACoA)", sh:[["p","M325.2,271.6 L274.8,271.6 L267.6,321.9 L278.4,347.1 L321.6,347.1 L332.4,321.9 Z"]]}
  ]
});

/* ---------------- Coronal · posterior ---------------- */
S.push({
  id:"cor-p", group:"Cerebrum", name:"Coronal · posterior (splenium)", w:600, h:560, center:[198,258],
  view:"Coronal, through the splenium, atrium and parietal lobes · top of the head up",
  outline:"M53.3,302.1 L56.7,336.1 L63.5,346.4 L66.9,366.8 L82.2,388.9 L99.2,399.1 L109.5,399.1 L112.9,402.5 L140.1,402.5 L146.9,405.9 L152.0,411.0 L155.4,428.0 L165.6,441.6 L162.2,448.4 L165.6,465.4 L191.1,487.6 L197.9,487.6 L201.3,491.0 L242.2,491.0 L255.8,480.8 L264.3,489.3 L267.7,506.3 L277.9,526.7 L289.8,538.6 L303.4,542.0 L322.1,526.7 L332.3,506.3 L335.7,489.3 L344.2,480.8 L347.6,480.8 L357.8,491.0 L398.7,491.0 L402.1,487.6 L408.9,487.6 L434.4,465.4 L437.8,458.6 L434.4,441.6 L444.6,428.0 L448.0,411.0 L453.1,405.9 L459.9,402.5 L487.1,402.5 L490.5,399.1 L500.8,399.1 L517.8,388.9 L529.7,373.6 L536.5,346.4 L543.3,336.1 L543.3,319.1 L546.7,315.7 L546.7,302.1 L539.9,285.1 L543.3,261.3 L539.9,257.9 L536.5,196.6 L533.1,193.2 L529.7,162.6 L522.9,145.6 L505.9,125.2 L502.5,115.0 L487.1,99.7 L463.3,92.9 L432.7,62.2 L419.1,58.8 L402.1,48.6 L385.1,45.2 L364.6,24.8 L351.0,18.0 L337.4,18.0 L320.4,24.8 L303.4,41.8 L296.6,41.8 L279.6,24.8 L262.6,18.0 L249.0,18.0 L235.4,24.8 L214.9,45.2 L197.9,48.6 L180.9,58.8 L167.3,62.2 L136.7,92.9 L112.9,99.7 L97.5,115.0 L94.1,125.2 L77.1,145.6 L70.3,162.6 L70.3,172.8 L66.9,176.2 L66.9,193.2 L63.5,196.6 L63.5,230.7 L60.1,234.1 L60.1,257.9 L56.7,261.3 L60.1,285.1 Z",
  hemi:"M53.3,302.1 L56.7,336.1 L63.5,346.4 L66.9,366.8 L82.2,388.9 L99.2,399.1 L109.5,399.1 L112.9,402.5 L140.1,402.5 L146.9,405.9 L152.0,411.0 L155.4,428.0 L165.6,441.6 L162.2,448.4 L165.6,465.4 L191.1,487.6 L197.9,487.6 L201.3,491.0 L242.2,491.0 L255.8,480.8 L264.3,489.3 L267.7,506.3 L277.9,526.7 L289.8,538.6 L298.3,540.3 L298.3,43.5 L279.6,24.8 L262.6,18.0 L249.0,18.0 L235.4,24.8 L214.9,45.2 L197.9,48.6 L180.9,58.8 L167.3,62.2 L136.7,92.9 L112.9,99.7 L97.5,115.0 L94.1,125.2 L77.1,145.6 L70.3,162.6 L70.3,172.8 L66.9,176.2 L66.9,193.2 L63.5,196.6 L63.5,230.7 L60.1,234.1 L60.1,257.9 L56.7,261.3 L60.1,285.1 Z",
  inner:"M70.3,251.1 L82.2,263.0 L92.4,256.2 L107.8,257.9 L104.4,261.3 L107.8,278.3 L104.4,302.1 L99.2,310.6 L85.6,310.6 L73.7,325.9 L85.6,337.8 L106.1,334.4 L116.3,354.9 L153.7,358.3 L163.9,368.5 L170.7,365.1 L196.2,394.0 L203.0,411.0 L197.9,426.3 L221.7,446.7 L252.4,446.7 L264.3,458.6 L274.5,479.1 L274.5,499.5 L281.3,513.1 L296.6,528.4 L298.3,230.7 L277.9,213.6 L288.1,203.4 L288.1,196.6 L276.2,184.7 L262.6,188.1 L254.1,179.6 L271.1,152.4 L259.2,140.5 L252.4,147.3 L247.3,145.6 L250.7,111.6 L266.0,99.7 L276.2,99.7 L288.1,87.8 L291.5,57.1 L284.7,43.5 L269.4,28.2 L249.0,28.2 L233.6,43.5 L237.1,77.5 L231.9,89.5 L191.1,103.1 L180.9,113.3 L174.1,106.5 L162.2,118.4 L169.0,125.2 L160.5,133.7 L129.9,106.5 L114.6,118.4 L118.0,152.4 L109.5,160.9 L95.8,157.5 L83.9,169.4 L83.9,176.2 L94.1,189.8 L83.9,200.0 L100.9,220.5 Z",
  structs:[
    {id:"wmp", n:"Parietal white matter (SLF, arcuate fasciculus)", a:"P-WM", k:"wm", sh:["w",260,90], clip:"wm", fn:"Parieto-frontal and parieto-temporal association fibers", d:[["{C} neglect","contra","R"],["Conduction aphasia, ideomotor apraxia","bi","L"]]},
    {id:"wmo", n:"Temporo-occipital white matter (inferior longitudinal fasciculus)", a:"TO-WM", k:"wm", sh:["w",150,260], clip:"wm", fn:"Ventral visual stream", d:[["Visual agnosia when both sides are involved","bi"]]},
    {id:"pcun", n:"Precuneus and posterior cingulate (medial parietal)", a:"PCun", k:"ctx", sh:["w",30,95], clip:"ctx", fn:"Visuospatial imagery, episodic memory retrieval", d:[["Topographical disorientation","bi"]]},
    {id:"spl", n:"Superior parietal lobule", a:"SPL", k:"ctx", sh:["w",330,30], clip:"ctx", fn:"Reaching, body schema", d:[["{C} optic ataxia","contra"],["{C} cortical sensory loss","contra"]]},
    {id:"ipl", n:"Inferior parietal lobule (supramarginal and angular gyri)", a:"IPL", k:"ctx", sh:["w",260,330], clip:"ctx", fn:"Language, calculation, praxis (left); spatial attention (right)", d:[["Gerstmann syndrome, alexia with agraphia, conduction aphasia, ideomotor apraxia","bi","L"],["{C} hemispatial neglect, anosognosia, dressing and constructional apraxia","contra","R"]]},
    {id:"pmtg", n:"Posterior middle and inferior temporal gyri (MT/V5)", a:"MT", k:"ctx", sh:["w",200,260], clip:"ctx", fn:"Visual motion, smooth pursuit", d:[["Impaired pursuit toward the {I} side","ipsi"],["Anomia","bi","L"]]},
    {id:"fus", n:"Posterior fusiform and parahippocampal gyri", a:"Fus", k:"ctx", sh:["w",150,200], clip:"ctx", fn:"Faces, words, scenes", d:[["Prosopagnosia","bi","R"],["Pure alexia","bi","L"],["Topographic agnosia","bi"]]},
    {id:"rsp", n:"Retrosplenial cortex and cingulate isthmus", a:"RSp", k:"ctx", sh:["w",95,150], clip:"ctx", fn:"Memory and navigation", d:[["Retrosplenial amnesia and topographic disorientation","bi"]]},
    {id:"arc", n:"Arcuate fasciculus", a:"AF", k:"tract", sh:["e",163.9,210.2,13.6,27.2], fn:"Links Wernicke and Broca areas", d:[["Conduction aphasia","bi","L"],["{C} neglect","contra","R"]]},
    {id:"or", n:"Optic radiation (sagittal stratum, lateral wall of the atrium)", a:"OR", k:"tract", sh:["p","M209.8,222.2 L199.6,237.5 L194.5,254.5 L191.1,268.1 L186.0,280.0 L179.2,291.9 L169.0,308.9 L177.5,315.7 L186.0,297.0 L191.1,288.5 L196.2,278.3 L199.6,268.1 L202.7,254.5 L206.1,240.9 L214.9,225.6 Z"], fn:"LGN to calcarine cortex", d:[D.hemianopia]},
    {id:"atr", n:"Lateral ventricle, atrium", a:"Atr", k:"csf", sh:["p","M228.5,218.8 L240.5,227.3 L243.9,240.9 L241.1,257.9 L238.8,268.1 L228.5,273.2 L218.3,276.6 L208.1,283.4 L201.3,293.6 L194.5,302.1 L180.9,314.4 L178.2,308.9 L186.0,297.0 L191.1,288.5 L196.2,278.3 L199.6,268.1 L202.7,254.5 L206.1,240.9 L214.9,225.6 Z"], d:[]},
    {id:"chp", n:"Choroid plexus (glomus)", a:"ChP", k:"nuc", sh:["e",221.7,254.5,10.2,8.5], fn:"CSF production", d:[["Calcifies normally; intraventricular hemorrhage source","bi"]]},
    {id:"fxc", n:"Crus of the fornix", a:"Fx", k:"tract", sh:["e",255.8,276.6,10.9,5.1], fn:"Hippocampal output", d:[["Anterograde amnesia","bi"]]},
    {id:"hipt", n:"Hippocampal tail", a:"Hip", k:"ctx", sh:["e",233.6,291.2,32.3,8.2], fn:"Episodic memory", d:[D.amnesia]},
    {id:"ccs", n:"Corpus callosum, splenium", a:"CCs", k:"tract", s:"M", sh:["p","M354.4,227.3 L327.2,220.5 L300.0,221.8 L272.8,220.5 L245.6,227.3 L242.2,254.5 L240.5,271.5 L266.0,274.9 L300.0,274.2 L334.0,274.9 L359.5,271.5 L357.8,254.5 Z"], fn:"Connects parietal and occipital lobes", d:[["Left visual field anomia; alexia without agraphia with a left occipital lesion","bi"]]},
    {id:"cbs", n:"Cerebellar hemisphere (superior)", a:"Cb", k:"ctx", sh:["p","M298.3,383.8 L279.6,390.6 L262.6,402.5 L231.9,422.9 L208.1,439.9 L187.7,445.0 L167.3,446.7 L163.9,462.0 L174.1,475.6 L187.7,485.9 L208.1,491.0 L238.8,492.7 L266.0,485.9 L283.0,496.1 L298.3,502.9 Z"], clip:"out", fn:"Limb coordination", d:[D.ataxI,["Dysarthria","bi"]]},
    {id:"verm", n:"Cerebellar vermis (superior and posterior)", a:"Verm", k:"ctx", s:"M", sh:["p","M320.4,387.2 L279.6,387.2 L269.4,414.4 L269.4,496.1 L330.6,496.1 L330.6,414.4 Z"], fn:"Gait and eye movements", d:[["Gait and truncal ataxia, nystagmus","bi"]]}
  ],
  terr:[
    {id:"mcas", n:"MCA superior division (M4): posterior parietal branches", f:"MCA", sh:["w",290,15]},
    {id:"mcai", n:"MCA inferior division (M4): angular and posterior temporal branches", f:"MCA", sh:["w",225,290]},
    {id:"aca", n:"ACA (A4): pericallosal precuneal branches", f:"ACA", sh:["w",15,80]},
    {id:"pca", n:"PCA (P3–P4): parieto-occipital, posterior temporal and hippocampal branches", f:"PCA", sh:["w",80,225]},
    {id:"wsa", n:"ACA–MCA cortical border zone (posterior parasagittal)", f:"WS", sh:["w",8,24], clip:"ctx"},
    {id:"wsp", n:"Posterior watershed: MCA–PCA cortical border zone", f:"WS", sh:["w",215,235], clip:"ctx"},
    {id:"spl", n:"Posterior pericallosal (splenial) artery (PCA)", f:"PCA", sh:["e",276.2,247.7,27.2,23.8]},
    {id:"chp", n:"Lateral posterior choroidal artery (P2) and anterior choroidal artery: atrial choroid plexus", f:"PCAd", sh:["e",221.7,254.5,17.0,13.6]},
    {id:"sca", n:"Superior cerebellar artery: superior hemisphere and vermis", f:"SCA", sh:["p","M298.3,383.8 L279.6,390.6 L262.6,402.5 L231.9,422.9 L208.1,439.9 L187.7,445.0 L167.3,446.7 L163.9,462.0 L174.1,475.6 L187.7,485.9 L208.1,491.0 L238.8,492.7 L266.0,485.9 L283.0,496.1 L298.3,502.9 Z"], clip:"out"}
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
    {n:"Left inferior parietal lobule", sh:[["e",514.4,196.6,18.7,22.1]]},
    {n:"Left splenium and occipital radiation", sh:[["p","M303.4,223.9 L340.8,222.2 L371.5,218.8 L391.9,230.7 L405.5,257.9 L419.1,291.9 L429.3,312.3 L412.3,305.5 L398.7,274.9 L388.5,254.5 L361.2,261.3 L327.2,271.5 L303.4,271.5 Z"]]},
    {n:"Right superior cerebellum (SCA)", sh:[["e",225.1,460.3,37.4,18.7]]}
  ]
});

/* ---------------- Axial · posterior fossa ---------------- */
S.push({
  id:"ax-pf", group:"Posterior fossa", name:"Axial · posterior fossa (pons and cerebellum)", w:600, h:520,
  view:"Axial, at the midpons and middle cerebellar peduncles · front at the top",
  outline:"M40.0,300.6 L54.3,367.3 L78.2,405.5 L118.7,441.3 L156.9,460.4 L185.5,465.1 L190.3,469.9 L238.0,469.9 L242.8,465.1 L266.6,460.4 L283.3,443.7 L288.1,424.6 L295.2,417.4 L307.2,419.8 L316.7,443.7 L342.9,465.1 L357.2,465.1 L362.0,469.9 L409.7,469.9 L414.5,465.1 L443.1,460.4 L495.6,431.7 L521.8,405.5 L545.7,367.3 L550.5,338.7 L555.2,333.9 L555.2,310.1 L560.0,305.3 L557.6,298.2 L538.5,298.2 L486.1,250.5 L457.4,231.4 L455.0,224.2 L402.6,171.7 L402.6,162.2 L388.3,138.3 L378.7,57.2 L371.6,50.1 L364.4,52.5 L364.4,71.6 L352.5,83.5 L342.9,78.7 L328.6,78.7 L323.9,83.5 L276.1,83.5 L271.4,78.7 L257.1,78.7 L247.5,83.5 L235.6,71.6 L235.6,52.5 L228.4,50.1 L221.3,57.2 L211.7,138.3 L197.4,162.2 L197.4,171.7 L145.0,224.2 L142.6,231.4 L113.9,250.5 L61.5,298.2 Z",
  structs:[
    {id:"cbh", n:"Cerebellar hemisphere (posterior lobe: Crus I and II, lobules VI–VIII)", a:"CbH", k:"ctx", sh:["p","M300.0,-23.9 L-153.2,-23.9 L-153.2,644.0 L300.0,644.0 Z"], clip:"out", fn:"Limb coordination; cognition (Crus I/II)", d:[D.ataxI,["{I} intention tremor and dysdiadochokinesia","ipsi"],["Dysarthria","bi"],["Executive and visuospatial problems (cerebellar cognitive affective syndrome)","bi"]]},
    {id:"floc", n:"Flocculus and paraflocculus", a:"Floc", k:"ctx", sh:["e",176.0,224.2,16.7,11.9], fn:"Gaze holding, pursuit, VOR suppression", d:[["Downbeat and gaze-evoked nystagmus, broken pursuit","bi"],["Imbalance","ipsi"]]},
    {id:"mcp", n:"Middle cerebellar peduncle", a:"MCP", k:"tract", sh:["p","M228.4,138.3 L209.4,157.4 L176.0,214.7 L152.1,252.8 L171.2,271.9 L204.6,243.3 L238.0,205.1 Z"], fn:"Pontocerebellar input", d:[D.ataxI]},
    {id:"vroot", n:"Trigeminal nerve root (cerebellopontine angle)", a:"V", k:"tract", sh:["p","M218.9,124.0 L171.2,100.2 L166.4,114.5 L214.1,143.1 Z"], fn:"Facial sensation and chewing", d:[["{I} facial numbness and weak chewing","ipsi"]]},
    {id:"dent", n:"Dentate nucleus", a:"Dent", k:"nuc", sh:["p","M252.3,281.5 L233.2,271.9 L214.1,276.7 L199.8,291.0 L204.6,310.1 L223.7,319.6 L242.8,314.9 L252.3,300.6 Z"], fn:"Cerebellar output to the opposite thalamus and red nucleus", d:[["{I} intention tremor, dysmetria","ipsi"]]},
    {id:"intp", n:"Interposed nuclei (emboliform and globose)", a:"Int", k:"nuc", sh:["e",259.4,281.5,8.6,8.6], fn:"Output to red nucleus", d:[D.ataxI]},
    {id:"fast", n:"Fastigial nucleus", a:"Fast", k:"nuc", sh:["e",283.3,264.8,7.2,7.2], fn:"Vestibular and saccade control", d:[["Truncal ataxia, saccadic overshoot","bi"]]},
    {id:"scp", n:"Superior cerebellar peduncle (lateral wall of the fourth ventricle)", a:"SCP", k:"tract", sh:["e",261.8,224.2,11.4,19.1], fn:"Cerebellar output before its crossing", d:[["{I} ataxia and intention tremor","ipsi"]]},
    {id:"pbas", n:"Basis pontis (corticospinal tract, pontine nuclei)", a:"BP", k:"tract", sh:["p","M300.0,73.9 L271.4,71.6 L238.0,81.1 L218.9,105.0 L214.1,138.3 L223.7,162.2 L257.1,171.7 L300.0,171.7 Z"], fn:"Descending motor fibers and pontocerebellar relay", d:[D.wkFAL,D.ataxC,["Dysarthria","bi"]]},
    {id:"pteg", n:"Pontine tegmentum (cranial nerve nuclei, lemnisci, MLF, PPRF)", a:"PT", k:"nuc", sh:["p","M300.0,171.7 L257.1,171.7 L223.7,162.2 L228.4,186.1 L252.3,205.1 L271.4,202.8 L300.0,198.0 Z"], fn:"Gaze centers, trigeminal nuclei, sensory tracts, arousal", d:[["Horizontal gaze palsy or INO toward the {I} side","ipsi"],["{C} hemisensory loss","contra"],["{I} facial numbness","ipsi"],["Coma if both sides","bi","BOTH"]]},
    {id:"v4", n:"Fourth ventricle", a:"4V", k:"csf", s:"M", sh:["p","M323.9,200.4 L276.1,200.4 L266.6,219.4 L271.4,243.3 L290.5,257.6 L309.5,257.6 L328.6,243.3 L333.4,219.4 Z"], d:[["Compression causes obstructive hydrocephalus","bi"]]},
    {id:"nod", n:"Nodulus and uvula", a:"Nod", k:"ctx", s:"M", sh:["e",300.0,271.9,19.1,11.9], fn:"Velocity storage, tilt processing", d:[["Truncal ataxia, positional and periodic alternating nystagmus","bi"]]},
    {id:"verm", n:"Vermis (declive, folium, tuber: oculomotor vermis)", a:"Verm", k:"ctx", s:"M", sh:["e",300.0,357.8,28.6,81.1], fn:"Gait, posture, saccade accuracy", d:[["Gait and truncal ataxia, saccadic dysmetria","bi"]]}
  ],
  terr:[
    {id:"sca", n:"Superior cerebellar artery (lateral branch): superolateral hemisphere, dentate nucleus, superior peduncle", f:"SCA", sh:["p","M300.0,-23.9 L-153.2,-23.9 L-153.2,644.0 L300.0,644.0 Z"], clip:"out"},
    {id:"aica", n:"AICA: middle cerebellar peduncle, flocculus, anterior inferior hemisphere, trigeminal root zone", f:"AICA", sh:["p","M228.4,128.8 L195.0,157.4 L128.3,214.7 L85.3,286.2 L156.9,319.6 L204.6,252.8 L238.0,195.6 Z"], clip:"out"},
    {id:"pica", n:"PICA (medial branch): inferior vermis, nodulus, medial posterior hemisphere", f:"PICA", sh:["p","M300.0,257.6 L261.8,262.4 L228.4,333.9 L214.1,429.4 L252.3,500.9 L300.0,500.9 Z"], clip:"out"},
    {id:"bcirc", n:"Short and long circumferential branches of the basilar artery: lateral pons", f:"BA", sh:["p","M257.1,71.6 L218.9,100.2 L209.4,147.9 L223.7,171.7 L242.8,171.7 L233.2,128.8 L261.8,81.1 Z"], clip:"out"},
    {id:"bpara", n:"Paramedian (pontine perforating) branches of the basilar artery", f:"BA", sh:["p","M300.0,71.6 L261.8,71.6 L252.3,138.3 L257.1,195.6 L300.0,195.6 Z"]}
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
    {n:"Right cerebellar hemisphere", sh:[["e",156.9,348.3,47.7,57.2]]},
    {n:"Vermis (midline)", sh:[["e",300.0,357.8,26.2,71.6]]},
    {n:"Left middle cerebellar peduncle (AICA)", sh:[["e",409.7,214.7,23.9,28.6]]},
    {n:"Bilateral ventral pons", sh:[["e",300.0,114.5,62.0,33.4]]}
  ]
});

/* ---------------- Parasagittal · internal capsule ---------------- */
const PARA_CB = "M330,382 C370,368 450,360 500,372 C540,384 552,420 524,442 C490,462 400,462 360,446 C330,434 316,404 330,382 Z";
const PARA_CR = "M88,236 C70,160 130,66 256,46 C386,30 502,74 540,168 C560,226 552,288 516,312 C482,334 440,330 404,318 L398,318 C376,352 330,372 276,370 C232,368 200,352 188,330 C176,312 178,300 190,292 L168,290 C130,290 100,272 88,236 Z";
S.push({
  id:"para", group:"Cerebrum", name:"Parasagittal · internal capsule", w:600, h:470, center:[278,227], mid:true, para:true,
  view:"Sagittal, about 2 cm from the midline through the internal capsule and thalamus · front of the head to the left · choose the hemisphere above",
  outline:"M24.5,230.3 L24.5,277.0 L33.9,292.6 L33.9,301.9 L44.8,319.0 L51.0,319.0 L54.1,322.2 L69.7,322.2 L72.8,325.3 L91.5,325.3 L94.6,328.4 L113.2,328.4 L144.4,340.8 L175.5,340.8 L178.6,343.9 L194.2,343.9 L200.4,347.1 L208.2,358.0 L195.7,373.5 L195.7,389.1 L206.6,403.1 L228.4,412.4 L247.1,406.2 L262.6,387.5 L284.4,378.2 L306.2,359.5 L312.5,356.4 L328.0,356.4 L338.9,367.3 L345.1,379.7 L348.2,395.3 L354.5,407.8 L366.9,420.2 L366.9,426.4 L373.1,438.9 L396.5,452.9 L405.8,452.9 L408.9,456.0 L452.5,456.0 L455.6,452.9 L461.9,452.9 L489.9,437.3 L519.4,407.8 L522.6,398.4 L531.9,386.0 L531.9,379.7 L538.1,367.3 L538.1,339.3 L535.0,336.2 L535.0,329.9 L545.9,322.2 L552.1,322.2 L559.9,314.4 L575.5,283.2 L575.5,233.4 L569.2,224.1 L569.2,214.8 L563.0,202.3 L563.0,196.1 L556.8,186.8 L556.8,180.5 L541.2,161.9 L541.2,152.5 L535.0,143.2 L535.0,137.0 L528.8,124.5 L519.4,115.2 L510.1,99.6 L491.4,87.1 L488.3,71.6 L480.5,63.8 L468.1,60.7 L460.3,52.9 L455.6,42.0 L443.2,35.8 L433.8,35.8 L408.9,20.2 L399.6,20.2 L387.2,14.0 L374.7,14.0 L371.6,17.1 L340.5,14.0 L331.1,20.2 L324.9,20.2 L321.8,17.1 L303.1,17.1 L290.7,23.3 L256.4,20.2 L237.7,29.6 L219.1,32.7 L191.1,48.2 L184.8,48.2 L172.4,54.5 L159.9,66.9 L135.0,79.4 L110.1,104.3 L96.1,112.0 L86.8,130.7 L65.0,149.4 L61.9,158.7 L43.2,177.4 L43.2,183.6 L37.0,193.0 L37.0,208.5 Z", hemi:"M24.5,230.3 L24.5,277.0 L33.9,292.6 L33.9,301.9 L44.8,319.0 L51.0,319.0 L54.1,322.2 L69.7,322.2 L72.8,325.3 L91.5,325.3 L94.6,328.4 L113.2,328.4 L144.4,340.8 L175.5,340.8 L178.6,343.9 L194.2,343.9 L200.4,347.1 L208.2,358.0 L195.7,373.5 L195.7,389.1 L206.6,403.1 L228.4,412.4 L247.1,406.2 L262.6,387.5 L284.4,378.2 L306.2,359.5 L312.5,356.4 L328.0,356.4 L331.1,359.5 L332.7,320.6 L349.8,312.8 L371.6,297.3 L415.2,297.3 L418.3,294.1 L421.4,297.3 L443.2,297.3 L446.3,300.4 L471.2,300.4 L511.7,315.9 L521.0,315.9 L533.5,328.4 L536.6,328.4 L545.9,322.2 L552.1,322.2 L559.9,314.4 L575.5,283.2 L575.5,233.4 L569.2,224.1 L569.2,214.8 L563.0,202.3 L563.0,196.1 L556.8,186.8 L556.8,180.5 L541.2,161.9 L541.2,152.5 L535.0,143.2 L535.0,137.0 L528.8,124.5 L519.4,115.2 L510.1,99.6 L491.4,87.1 L488.3,71.6 L480.5,63.8 L468.1,60.7 L460.3,52.9 L455.6,42.0 L443.2,35.8 L433.8,35.8 L408.9,20.2 L399.6,20.2 L387.2,14.0 L374.7,14.0 L371.6,17.1 L340.5,14.0 L331.1,20.2 L324.9,20.2 L321.8,17.1 L303.1,17.1 L290.7,23.3 L256.4,20.2 L237.7,29.6 L219.1,32.7 L191.1,48.2 L184.8,48.2 L172.4,54.5 L159.9,66.9 L135.0,79.4 L110.1,104.3 L96.1,112.0 L86.8,130.7 L65.0,149.4 L61.9,158.7 L43.2,177.4 L43.2,183.6 L37.0,193.0 L37.0,208.5 Z",
  inner:"M30.8,236.6 L30.8,242.8 L46.3,258.3 L43.2,261.5 L47.9,266.1 L54.1,272.4 L57.2,269.2 L66.5,272.4 L74.3,280.1 L61.9,295.7 L72.8,306.6 L82.1,297.3 L107.0,294.1 L122.6,309.7 L138.1,294.1 L144.4,294.1 L194.2,322.2 L203.5,322.2 L216.0,306.6 L245.5,333.0 L250.2,347.1 L296.9,315.9 L318.7,312.8 L331.1,325.3 L334.2,319.0 L371.6,297.3 L415.2,297.3 L418.3,294.1 L446.3,300.4 L471.2,300.4 L496.1,309.7 L517.9,287.9 L530.3,284.8 L538.1,295.7 L535.0,301.9 L545.9,312.8 L559.9,298.8 L569.2,280.1 L569.2,267.7 L563.0,261.5 L569.2,252.1 L569.2,236.6 L556.8,224.1 L553.7,202.3 L539.7,188.3 L521.0,207.0 L513.2,196.1 L513.2,189.9 L528.8,168.1 L531.9,155.6 L522.6,143.2 L522.6,133.8 L510.1,121.4 L507.0,112.0 L489.9,98.0 L477.4,110.5 L465.0,116.7 L458.7,113.6 L451.0,99.6 L432.3,84.0 L447.9,56.0 L437.0,42.0 L426.1,52.9 L419.8,68.5 L412.1,73.1 L393.4,60.7 L380.9,57.6 L362.3,60.7 L357.6,56.0 L354.5,37.3 L343.6,26.5 L331.1,38.9 L318.7,26.5 L312.5,29.6 L300.0,26.5 L289.1,37.3 L289.1,52.9 L281.3,60.7 L264.2,37.3 L253.3,32.7 L239.3,46.7 L251.8,62.2 L253.3,70.0 L234.6,73.1 L219.1,82.5 L217.5,65.4 L203.5,54.5 L181.7,60.7 L156.8,85.6 L144.4,85.6 L133.5,96.5 L155.3,118.3 L127.2,143.2 L116.4,160.3 L103.9,147.8 L97.7,151.0 L91.5,144.7 L82.1,144.7 L71.2,155.6 L71.2,165.0 L46.3,189.9 L46.3,199.2 L55.7,208.5 L55.7,221.0 L47.9,228.8 L41.6,225.7 Z",
  structs:[
    {id:"wmcr", n:"Corona radiata and centrum semiovale", a:"CR", k:"wm", sh:["p","M184.8,-37.4 L387.2,-37.4 L371.6,211.7 L262.6,196.1 L200.4,196.1 Z"], clip:"wm", fn:"Projection fibers fanning toward the internal capsule", d:[["{C} face, arm and leg weakness (upper motor neuron)","contra"],["{C} hemisensory loss","contra"]]},
    {id:"wmf", n:"Frontal white matter", a:"F-WM", k:"wm", sh:["p","M-48.6,-37.4 L184.8,-37.4 L200.4,196.1 L169.3,242.8 L153.7,273.9 L-48.6,273.9 Z"], clip:"wm", fn:"Frontostriatal and frontothalamic fibers", d:[["Apathy, executive dysfunction","bi"]]},
    {id:"wmp", n:"Parieto-occipital white matter (SLF, optic radiation upper fibers)", a:"PO-WM", k:"wm", sh:["p","M387.2,-37.4 L651.7,-37.4 L651.7,289.5 L387.2,258.3 L371.6,211.7 Z"], clip:"wm", fn:"Parietal association and visual fibers", d:[["{C} inferior quadrantanopia","contra"],["{C} neglect","contra","R"]]},
    {id:"wmt", n:"Temporal white matter (temporal stem)", a:"T-WM", k:"wm", sh:["p","M153.7,273.9 L387.2,258.3 L651.7,289.5 L651.7,445.1 L153.7,445.1 Z"], clip:"wm", fn:"Temporal association fibers", d:[["Naming and semantic deficits","bi","L"]]},
    {id:"ofc", n:"Frontal pole and lateral orbitofrontal cortex", a:"OFC", k:"ctx", sh:["p","M-48.6,273.9 L153.7,273.9 L153.7,445.1 L-48.6,445.1 Z"], clip:"ctx", fn:"Social behaviour, decision-making", d:[["Disinhibition, poor judgment","bi"]]},
    {id:"pfc", n:"Prefrontal cortex (superior and middle frontal gyri)", a:"PFC", k:"ctx", sh:["p","M-48.6,-37.4 L253.3,-37.4 L253.3,165.0 L184.8,227.2 L153.7,273.9 L-48.6,273.9 Z"], clip:"ctx", fn:"Executive control, working memory", d:[["Dysexecutive syndrome","bi"]]},
    {id:"pm", n:"Premotor cortex and frontal eye field", a:"PM", k:"ctx", sh:["p","M253.3,-37.4 L290.7,-37.4 L290.7,165.0 L253.3,165.0 Z"], clip:"ctx", fn:"Movement planning, voluntary saccades", d:[["Eyes deviate toward the {I} side acutely","ipsi"],["{C} proximal weakness, limb-kinetic apraxia","contra"]]},
    {id:"m1", n:"Precentral gyrus (primary motor: leg and trunk near the top, arm lower)", a:"M1", k:"ctx", sh:["p","M290.7,-37.4 L328.0,-37.4 L328.0,165.0 L290.7,165.0 Z"], clip:"ctx", fn:"Voluntary movement", d:[["{C} leg, trunk and arm weakness","contra"]]},
    {id:"s1", n:"Postcentral gyrus (primary somatosensory)", a:"S1", k:"ctx", sh:["p","M328.0,-37.4 L359.1,-37.4 L359.1,165.0 L328.0,165.0 Z"], clip:"ctx", fn:"Discriminative touch and position sense", d:[["{C} cortical sensory loss","contra"]]},
    {id:"par", n:"Parietal lobule (superior parietal and supramarginal)", a:"Par", k:"ctx", sh:["p","M359.1,-37.4 L418.3,-37.4 L418.3,180.5 L359.1,180.5 Z"], clip:"ctx", fn:"Reaching, praxis, spatial attention", d:[["{C} optic ataxia","contra"],["{C} neglect","contra","R"],["Ideomotor apraxia","bi","L"]]},
    {id:"ang", n:"Angular gyrus and parieto-occipital cortex", a:"AG", k:"ctx", sh:["p","M418.3,-37.4 L465.0,-37.4 L465.0,211.7 L418.3,211.7 Z"], clip:"ctx", fn:"Reading, writing, calculation (left); attention (right)", d:[["Gerstmann syndrome, alexia with agraphia","bi","L"],["{C} hemispatial neglect","contra","R"]]},
    {id:"occ", n:"Occipital cortex (lateral occipital and pole)", a:"Occ", k:"ctx", sh:["p","M465.0,-37.4 L651.7,-37.4 L651.7,295.7 L496.1,289.5 L465.0,211.7 Z"], clip:"ctx", fn:"Vision; macular representation at the pole", d:[["{C} homonymous field defect, central if the pole is involved","contra"]]},
    {id:"tocc", n:"Inferior temporo-occipital and fusiform cortex", a:"Fus", k:"ctx", sh:["p","M371.6,273.9 L496.1,289.5 L651.7,295.7 L651.7,445.1 L371.6,445.1 Z"], clip:"ctx", fn:"Faces, words, colour", d:[["Prosopagnosia","bi","R"],["Pure alexia","bi","L"]]},
    {id:"tmp", n:"Middle and inferior temporal gyri", a:"MTG", k:"ctx", sh:["p","M262.6,273.9 L371.6,273.9 L371.6,445.1 L262.6,445.1 Z"], clip:"ctx", fn:"Semantic memory, auditory association", d:[["Anomia, comprehension deficits","bi","L"]]},
    {id:"tp", n:"Temporal pole", a:"TP", k:"ctx", sh:["p","M153.7,273.9 L262.6,273.9 L262.6,445.1 L153.7,445.1 Z"], clip:"ctx", fn:"Semantic and social knowledge", d:[["Semantic deficits","bi","L"],["Behavioural change","bi","R"]]},
    {id:"lv", n:"Lateral ventricle (frontal horn and body)", a:"LV", k:"csf", sh:["e",337.4,193.0,7.8,9.3], d:[]},
    {id:"cau", n:"Caudate nucleus (head and body)", a:"Cd", k:"nuc", sh:["e",194.2,183.6,17.1,8.1], fn:"Associative and limbic striatum", d:[["Abulia, apathy, executive dysfunction","bi"]]},
    {id:"alic", n:"Internal capsule, anterior limb", a:"ALIC", k:"tract", sh:["p","M169.3,196.1 L219.1,193.0 L225.3,217.9 L184.8,221.0 Z"], fn:"Frontopontine fibers, anterior thalamic radiation", d:[["Abulia, executive dysfunction","bi"],["Mild {C} face and arm weakness","contra"]]},
    {id:"genu", n:"Internal capsule, genu", a:"Genu", k:"tract", sh:["p","M219.1,193.0 L237.7,193.0 L242.4,221.0 L225.3,217.9 Z"], fn:"Corticobulbar fibers", d:[["{C} lower face and tongue weakness, dysarthria","contra"]]},
    {id:"plic", n:"Internal capsule, posterior limb (corticospinal and sensory radiation)", a:"PLIC", k:"tract", sh:["p","M237.7,193.0 L262.6,196.1 L265.8,277.0 L253.3,286.4 L244.0,258.3 L242.4,221.0 Z"], fn:"Corticospinal fibers, thalamocortical sensory radiation", d:[["{C} face, arm and leg weakness (upper motor neuron)","contra"],["{C} hemisensory loss (posterior part)","contra"]]},
    {id:"rlic", n:"Internal capsule, retrolenticular part", a:"RL", k:"tract", sh:["p","M321.8,270.8 L340.5,264.6 L346.7,289.5 L328.0,295.7 Z"], fn:"Optic radiation leaving the lateral geniculate", d:[["{C} homonymous hemianopia","contra"]]},
    {id:"thal", n:"Thalamus (lateral: VL, VPL, VPM, pulvinar)", a:"Th", k:"nuc", sh:["e",303.1,242.8,34.2,31.1], fn:"Motor and sensory relay, visual attention", d:[["{C} loss of all sensation in face, arm and leg; later central pain","contra"],["{C} ataxia","contra"]]},
    {id:"lent", n:"Lentiform nucleus (putamen and globus pallidus)", a:"Lent", k:"nuc", sh:["e",219.1,256.8,32.7,34.2], fn:"Motor basal ganglia loop", d:[["{C} dystonia, hemichorea or parkinsonism","contra"],["{C} hemiparesis if the capsule is involved","contra"]]},
    {id:"stn", n:"Subthalamic nucleus", a:"STN", k:"nuc", sh:["e",265.8,270.8,7.5,4.7], fn:"Indirect pathway of the basal ganglia", d:[["{C} hemiballism","contra"]]},
    {id:"cp", n:"Cerebral peduncle (descending fibers)", a:"CP", k:"tract", sh:["p","M253.3,289.5 L275.1,289.5 L284.4,333.0 L262.6,339.3 Z"], fn:"Corticospinal and corticobulbar fibers entering the brainstem", d:[["{C} face, arm and leg weakness","contra"]]},
    {id:"orad", n:"Optic radiation (to the occipital lobe)", a:"OR", k:"tract", sh:["p","M328.0,264.6 L387.2,258.3 L449.4,252.1 L511.7,245.9 L511.7,264.6 L449.4,270.8 L387.2,277.0 L334.2,283.2 Z"], fn:"LGN to calcarine cortex", d:[["{C} homonymous hemianopia","contra"]]},
    {id:"mey", n:"Meyer loop (optic radiation over the temporal horn)", a:"Mey", k:"tract", sh:["p","M315.6,277.0 L290.7,286.4 L265.8,295.7 L259.5,305.0 L290.7,298.8 L321.8,289.5 Z"], fn:"Fibers for the upper visual field", d:[["{C} superior quadrantanopia","contra"]]},
    {id:"atr", n:"Atrium and occipital horn", a:"Atr", k:"csf", sh:["p","M340.5,183.6 L365.4,177.4 L387.2,189.9 L390.3,227.2 L377.8,239.7 L352.9,233.4 L340.5,214.8 Z"], d:[]},
    {id:"th", n:"Temporal horn", a:"TH", k:"csf", sh:["p","M265.8,308.1 L303.1,298.8 L334.2,283.2 L352.9,261.5 L359.1,267.7 L337.4,295.7 L306.2,311.3 L268.9,317.5 Z"], d:[]},
    {id:"amyg", n:"Amygdala", a:"Amy", k:"nuc", sh:["e",250.2,317.5,17.1,15.6], fn:"Fear and emotional memory", d:[["Reduced fear and emotional memory","bi"]]},
    {id:"hip", n:"Hippocampus", a:"Hip", k:"ctx", sh:["p","M265.8,339.3 L290.7,345.5 L321.8,333.0 L346.7,308.1 L365.4,277.0 L356.0,267.7 L334.2,295.7 L309.3,314.4 L278.2,320.6 Z"], fn:"Episodic memory", d:[["Anterograde amnesia (verbal if left, visual if right; severe if both)","bi"]]},
    {id:"cbl", n:"Cerebellar hemisphere", a:"Cb", k:"ctx", sh:["p","M340.5,326.8 L371.6,308.1 L418.3,305.0 L465.0,311.3 L511.7,326.8 L533.5,364.2 L521.0,407.8 L480.5,438.9 L433.8,451.3 L396.5,438.9 L371.6,407.8 L346.7,370.4 Z"], fn:"Limb coordination", d:[["{I} limb ataxia","ipsi"],["Dysarthria","bi"]]},
    {id:"dent", n:"Dentate nucleus", a:"Dent", k:"nuc", sh:["e",421.4,364.2,18.7,15.6], fn:"Cerebellar output", d:[["{I} intention tremor, dysmetria","ipsi"]]}
  ],
  terr:[
    {id:"aca", n:"ACA (A3–A4): callosomarginal branches, superior frontal and paracentral", f:"ACA", sh:["p","M-48.6,-37.4 L433.8,-37.4 L433.8,87.1 L153.7,102.7 L60.3,133.8 L-48.6,165.0 Z"]},
    {id:"mcaf", n:"MCA superior division (M2–M4): frontal and orbitofrontal branches", f:"MCA", sh:["p","M-48.6,165.0 L60.3,133.8 L153.7,102.7 L309.3,96.5 L309.3,273.9 L-48.6,273.9 Z"]},
    {id:"mcap", n:"MCA (M4): anterior parietal and angular branches", f:"MCA", sh:["p","M309.3,96.5 L433.8,87.1 L465.0,165.0 L433.8,258.3 L309.3,273.9 Z"]},
    {id:"pca", n:"PCA (P3–P4): calcarine, parieto-occipital, posterior and inferior temporal branches", f:"PCA", sh:["p","M433.8,87.1 L651.7,-37.4 L651.7,445.1 L340.5,445.1 L340.5,283.2 L433.8,258.3 L465.0,165.0 Z"]},
    {id:"mcat", n:"MCA inferior division and anterior temporal artery: anterior and middle temporal lobe", f:"MCA", sh:["p","M153.7,273.9 L340.5,283.2 L340.5,445.1 L153.7,445.1 Z"]},
    {id:"wsa", n:"ACA–MCA cortical border zone", f:"WS", sh:["p","M60.3,121.4 L371.6,77.8 L371.6,96.5 L60.3,140.1 Z"], clip:"ctx"},
    {id:"wsp", n:"MCA–PCA cortical border zone", f:"WS", sh:["p","M418.3,71.6 L465.0,77.8 L480.5,258.3 L440.1,258.3 Z"], clip:"ctx"},
    {id:"lsa", n:"Lateral lenticulostriate arteries (M1 MCA): caudate body, upper capsule, lentiform nucleus", f:"MCAd", sh:["p","M172.4,189.9 L262.6,189.9 L265.8,264.6 L247.1,283.2 L216.0,289.5 L184.8,277.0 L178.6,233.4 Z"]},
    {id:"heub", n:"Recurrent artery of Heubner (A1–A2 junction): caudate head, anterior limb", f:"ACAd", sh:["e",197.3,221.0,24.9,24.9]},
    {id:"acha", n:"Anterior choroidal artery (ICA): lower posterior limb, retrolenticular capsule, start of the optic radiation", f:"AChA", sh:["p","M253.3,221.0 L278.2,227.2 L290.7,277.0 L265.8,295.7 L247.1,283.2 Z"]},
    {id:"acha2", n:"Anterior choroidal artery (ICA): amygdala, hippocampal head, uncus", f:"AChA", sh:["e",259.5,314.4,21.8,18.7]},
    {id:"phip", n:"PCA hippocampal branches (P2): hippocampal body and tail", f:"PCA", sh:["e",315.6,308.1,37.4,18.7,-28]},
    {id:"tg", n:"Inferolateral (thalamogeniculate) arteries (P2 PCA): lateral thalamus", f:"PCAd", sh:["e",303.1,245.9,28.0,24.9]},
    {id:"lpch", n:"Lateral posterior choroidal artery (P2): pulvinar, lateral geniculate", f:"PCAd", sh:["e",340.5,233.4,18.7,18.7]},
    {id:"mes", n:"Mesencephalic perforators of P1 and the posterior communicating artery: subthalamic nucleus, peduncle", f:"PCAd", sh:["p","M253.3,289.5 L284.4,289.5 L290.7,339.3 L259.5,339.3 Z"]},
    {id:"sca", n:"Superior cerebellar artery: superior cerebellar hemisphere and dentate", f:"SCA", sh:["p","M340.5,326.8 L371.6,308.1 L418.3,305.0 L465.0,311.3 L511.7,326.8 L533.5,364.2 L433.8,370.4 L352.9,364.2 Z"]},
    {id:"pica", n:"PICA: inferior cerebellar hemisphere", f:"PICA", sh:["p","M352.9,364.2 L433.8,370.4 L533.5,364.2 L521.0,407.8 L480.5,438.9 L433.8,451.3 L396.5,438.9 L371.6,407.8 Z"]}
  ],
  syn:[
    {n:"Pure motor hemiparesis (lacunar)", need:[["plic","genu"]], not:["thal","m1","s1","par","rlic"], t:"Opposite face, arm and leg weakness without sensory or visual signs; lenticulostriate (upper) or anterior choroidal (lower) perforator."},
    {n:"Thalamic sensory stroke", need:[["thal"]], not:["plic"], t:"Opposite hemisensory loss, sometimes later central pain; thalamogeniculate perforators."},
    {n:"Sensorimotor stroke", need:[["plic"],["thal"]], t:"Weakness and sensory loss together."},
    {n:"Anterior choroidal artery syndrome", need:[["plic","rlic"],["orad","mey","rlic"]], t:"Hemiparesis, hemisensory loss and homonymous hemianopia with preserved cognition."},
    {n:"Recurrent artery of Heubner syndrome", need:[["cau"],["alic"]], t:"Face and arm weakness, dysarthria and abulia."},
    {n:"Striatocapsular infarct", need:[["lent"],["plic","alic","genu"]], t:"Several lenticulostriates at once, usually from M1 embolism."},
    {n:"Hemiballism", need:[["stn"]], t:"Flinging movements of the opposite limbs."},
    {n:"Meyer loop quadrantanopia", need:[["mey"]], t:"Opposite superior quadrantanopia (pie in the sky); temporal lobectomy, MCA inferior division or AChA territory."},
    {n:"Hippocampal infarct (PCA)", need:[["hip"]], t:"Verbal (left) or visual (right) memory impairment; severe amnesia needs both sides."},
    {n:"Gerstmann syndrome", only:"L", need:[["ang"]], t:"Agraphia, acalculia, finger agnosia, left-right confusion."},
    {n:"Hemispatial neglect", only:"R", need:[["par","ang"]], t:"Left neglect and anosognosia."},
    {n:"Cerebellar hemisphere syndrome", need:[["cbl","dent"]], t:"Same-side limb ataxia and intention tremor; watch for swelling."}
  ],
  presets:[
    {n:"Posterior limb lacune", sh:[["e",253.3,233.4,8.1,15.6]]},
    {n:"Caudate head and anterior limb (Heubner)", sh:[["e",197.3,196.1,18.7,17.1]]},
    {n:"Meyer loop and hippocampus (temporal)", sh:[["p","M278.2,283.2 L315.6,277.0 L328.0,314.4 L284.4,333.0 Z"]]},
    {n:"Lateral thalamus", sh:[["e",303.1,239.7,15.6,12.5]]}
  ]
});

/* rename the original coronal slice and put the slices in anatomical order */
const cor = S.find(s => s.id === "cor"); if (cor) cor.name = "Coronal · mid-thalamus";
const ORDER = ["ax-vx", "ax-cr", "ax-bg", "ax-ml", "cor-a", "cor", "cor-p", "sag", "para", "ax-pf"];
const rank = id => { const i = ORDER.indexOf(id); return i < 0 ? 99 : i; };
const sorted = S.slice().sort((a, b) => rank(a.id) - rank(b.id));
S.length = 0; sorted.forEach(s => S.push(s));
})();
