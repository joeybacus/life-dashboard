/* Neuro Localizer: reference tables (tracts, cortex, thalamus, hypothalamus, autonomic, vessels, brainstem syndromes). */
(function () {
const R = {};

/* Tracts: [name, group, origin, course (ordered, " → "), crossing, termination/function, lesion] */
R.tracts = [
  ["Corticospinal (pyramidal) tract", "Motor", "Primary motor cortex (layer V Betz cells), premotor, SMA, parietal", "Corona radiata → posterior limb of internal capsule → middle three-fifths of the cerebral peduncle → basis pontis bundles → medullary pyramid → pyramidal decussation (85–90%) → lateral corticospinal tract", "Lower medulla (pyramidal decussation); the uncrossed 10% descend as the anterior corticospinal tract", "Anterior horn cells; skilled distal movement", "Above the decussation: opposite weakness, spasticity, hyperreflexia, Babinski. Below it (cord): same-side weakness."],
  ["Corticobulbar tract", "Motor", "Face, tongue and larynx areas of the motor cortex", "Corona radiata → genu of internal capsule → medial crus → cranial nerve nuclei along the brainstem", "Mostly bilateral; the lower face (VII) and often XII receive mainly crossed fibers", "Cranial motor nuclei", "Unilateral: opposite lower face weakness, dysarthria. Bilateral: pseudobulbar palsy (dysphagia, emotional lability, brisk jaw jerk)."],
  ["Dorsal column–medial lemniscus", "Sensory", "Large-fiber receptors (vibration, position, fine touch)", "Dorsal root → gracile (leg) and cuneate (arm) fasciculi, same side → gracile and cuneate nuclei (lower medulla) → internal arcuate fibers cross → medial lemniscus → VPL thalamus → posterior limb → postcentral gyrus", "Lower medulla (sensory decussation)", "Primary somatosensory cortex", "Cord: same-side loss. Above the medulla: opposite loss of vibration and position sense, sensory ataxia, Romberg positive."],
  ["Spinothalamic tract (anterolateral system)", "Sensory", "Small-fiber receptors (pain, temperature, crude touch)", "Dorsal horn → crosses in the anterior white commissure within 1–2 segments → lateral funiculus → lateral brainstem → VPL thalamus → posterior limb → postcentral gyrus", "Spinal cord, near the level of entry", "Thalamus and cortex; also reticular formation", "Cord or brainstem: opposite loss of pain and temperature. Central cord syndrome: cape-like bilateral loss."],
  ["Trigeminal pathways", "Sensory", "Trigeminal ganglion", "Touch: principal sensory nucleus (mid pons) → crosses → trigeminal lemniscus → VPM. Pain and temperature: descends in the spinal trigeminal tract to C2 → nucleus → crosses → ventral trigeminothalamic tract → VPM", "Brainstem", "VPM thalamus → face area of postcentral gyrus", "Lateral medulla: same-side facial pain and temperature loss. Above the pons: opposite face and body together."],
  ["Spinocerebellar tracts", "Cerebellar", "Clarke's nucleus (leg), accessory cuneate nucleus (arm), spinal border cells", "Dorsal tract: same side → inferior cerebellar peduncle. Ventral tract: crosses in cord → superior cerebellar peduncle → crosses back", "Dorsal: none. Ventral: twice", "Vermis and paravermis, same side", "Same-side ataxia (Friedreich ataxia, lateral cord lesions)."],
  ["Corticopontocerebellar pathway", "Cerebellar", "Frontal, parietal, temporal and occipital cortex", "Internal capsule → medial and lateral crus → pontine nuclei → transverse fibers cross → middle cerebellar peduncle", "Pons", "Opposite lateral cerebellar hemisphere", "Basis pontis: opposite ataxic hemiparesis. MCP: same-side ataxia."],
  ["Dentatorubrothalamic pathway", "Cerebellar", "Dentate and interposed nuclei", "Superior cerebellar peduncle → decussation (caudal midbrain) → red nucleus → VL thalamus → motor and premotor cortex", "Caudal midbrain", "Motor cortex (then corticospinal recrosses)", "Below the decussation: same-side ataxia and intention tremor. Above: opposite (rubral, thalamic)."],
  ["Rubrospinal tract", "Motor", "Magnocellular red nucleus", "Crosses in the ventral tegmental decussation → lateral brainstem → lateral funiculus", "Midbrain", "Cervical cord; arm flexors", "Small in humans; decorticate posturing reflects intact rubrospinal output above a lesion."],
  ["Vestibulospinal tracts", "Motor", "Lateral (Deiters) and medial vestibular nuclei", "Lateral tract: same side, whole cord. Medial tract: both sides via MLF, neck", "Lateral: none", "Extensor (antigravity) and neck muscles", "Decerebrate posturing when released from higher control; imbalance."],
  ["Reticulospinal tracts", "Motor", "Pontine and medullary reticular formation", "Pontine (medial): same side. Medullary (lateral): mostly same side", "Partly", "Posture, locomotion, tone", "Spasticity patterns after corticospinal lesions."],
  ["Tectospinal tract", "Motor", "Superior colliculus", "Crosses in the dorsal tegmental decussation → medial cord (cervical)", "Midbrain", "Neck muscles", "Head orienting to visual and auditory stimuli."],
  ["Medial longitudinal fasciculus", "Eye movement", "Abducens internuclear neurons, vestibular nuclei", "Ascends paramedian beneath the fourth ventricle and aqueduct to the oculomotor and trochlear nuclei and INC", "Abducens internuclear fibers cross at once", "Medial rectus subnucleus; vertical gaze centers", "Internuclear ophthalmoplegia; skew deviation."],
  ["Central tegmental tract", "Cerebellar", "Parvocellular red nucleus (and periaqueductal grey)", "Dorsal pontine tegmentum → inferior olive (same side)", "None", "Inferior olive", "Delayed palatal tremor and hypertrophic olivary degeneration (Guillain–Mollaret triangle)."],
  ["Optic pathway", "Visual", "Retinal ganglion cells", "Optic nerve → chiasm (nasal fibers cross) → optic tract → LGN → optic radiation (Meyer loop in temporal lobe; dorsal fibers in parietal lobe) → calcarine cortex", "Chiasm (nasal retina)", "Primary visual cortex", "Nerve: monocular loss. Chiasm: bitemporal. Tract and beyond: opposite homonymous defects."],
  ["Pupillary light reflex", "Visual", "Retinal ganglion cells (intrinsically photosensitive)", "Optic tract → brachium of superior colliculus → pretectal nuclei → both Edinger–Westphal nuclei (via posterior commissure) → CN III → ciliary ganglion → sphincter", "Both sides (posterior commissure)", "Iris sphincter", "Afferent defect: RAPD. Dorsal midbrain: light-near dissociation."],
  ["Auditory pathway", "Sensory", "Cochlear nerve", "Cochlear nuclei → trapezoid body (crosses) → superior olive → lateral lemniscus → inferior colliculus → medial geniculate → auditory radiation → Heschl gyrus", "Multiple, bilateral", "Primary auditory cortex", "Unilateral deafness only from cochlear nerve or nuclei; central lesions affect localization and speech discrimination."],
  ["Arcuate fasciculus / SLF III", "Association", "Posterior temporal and inferior parietal cortex", "Curves around the posterior Sylvian fissure in deep parietal white matter → frontal operculum", "None", "Broca area and premotor cortex", "Conduction aphasia (left); neglect contributions (right)."],
  ["Superior longitudinal fasciculus I–II", "Association", "Parietal cortex", "Dorsal fronto-parietal white matter", "None", "Frontal eye field, dorsolateral prefrontal cortex", "Spatial neglect (right), attention and working memory deficits."],
  ["Inferior fronto-occipital fasciculus", "Association", "Occipital and posterior temporal cortex", "Temporal stem and external/extreme capsule", "None", "Inferior frontal and orbitofrontal cortex", "Semantic paraphasias (left); visual-semantic deficits."],
  ["Inferior longitudinal fasciculus", "Association", "Occipital cortex", "Lateral wall of the temporal horn and atrium", "None", "Anterior temporal lobe", "Visual agnosia, prosopagnosia, alexia (with other damage)."],
  ["Uncinate fasciculus", "Association", "Anterior temporal lobe and amygdala", "Hooks around the limen insulae", "None", "Orbitofrontal cortex", "Behavioural and semantic changes; often damaged in temporal lobectomy and trauma."],
  ["Cingulum", "Limbic", "Cingulate cortex", "Within the cingulate gyrus from the subcallosal region to the parahippocampal gyrus", "None", "Parahippocampal and entorhinal cortex", "Apathy, memory impairment."],
  ["Corpus callosum", "Commissural", "Both hemispheres", "Rostrum and genu (frontal), body (motor and sensory), splenium (occipital, parietal, temporal)", "Midline", "Homologous cortex", "Disconnection: left-hand apraxia, agraphia and tactile anomia; alien hand; alexia without agraphia (splenium)."],
  ["Anterior commissure", "Commissural", "Olfactory structures and anterior temporal lobes", "Crosses anterior to the fornix columns", "Midline", "Opposite temporal lobe", "Rarely symptomatic alone."],
  ["Fornix", "Limbic", "Hippocampus (subiculum)", "Fimbria → crus → body (under the corpus callosum) → columns → post-commissural fibers", "Hippocampal commissure links both sides", "Mammillary bodies, septal nuclei", "Anterograde amnesia (colloid cyst surgery, tumors)."],
  ["Mammillothalamic tract (Vicq d'Azyr)", "Limbic", "Mammillary bodies", "Ascends through the hypothalamus", "None", "Anterior nucleus of thalamus → cingulate (Papez circuit)", "Anterograde amnesia (tuberothalamic infarct)."],
  ["Medial forebrain bundle", "Hypothalamic", "Septal area, basal forebrain, brainstem monoamine nuclei", "Runs through the lateral hypothalamus in both directions", "None", "Hypothalamus, ventral tegmental area, prefrontal cortex", "Reward and motivation; apathy, anhedonia."],
  ["Stria terminalis", "Hypothalamic", "Amygdala", "Along the caudate in the floor of the lateral ventricle", "None", "Bed nucleus, ventromedial and anterior hypothalamus", "Fear and stress responses."],
  ["Ventral amygdalofugal pathway", "Hypothalamic", "Amygdala", "Beneath the lentiform nucleus", "None", "Hypothalamus, mediodorsal thalamus, septum", "Emotional and autonomic responses."],
  ["Dorsal longitudinal fasciculus (of Schütz)", "Hypothalamic", "Medial and periventricular hypothalamus", "Periaqueductal grey → floor of the fourth ventricle", "None", "Dorsal motor nucleus of X, salivatory nuclei, solitary nucleus", "Visceral and autonomic control."],
  ["Hypothalamospinal (descending sympathetic) tract", "Autonomic", "Paraventricular nucleus and posterior hypothalamus", "Lateral tegmentum of midbrain, pons and medulla (same side) → lateral cord → intermediolateral column T1–L2", "None", "Preganglionic sympathetic neurons (ciliospinal center C8–T2)", "Same-side central Horner syndrome (with anhidrosis of the body half)."],
  ["Supraoptic-hypophyseal tract", "Endocrine", "Supraoptic and paraventricular nuclei", "Down the pituitary stalk", "None", "Posterior pituitary (ADH, oxytocin)", "Central diabetes insipidus."],
  ["Tuberoinfundibular (tuberohypophyseal) tract", "Endocrine", "Arcuate (infundibular) nucleus and parvocellular neurons", "To the median eminence → hypophyseal portal veins", "None", "Anterior pituitary (releasing hormones; dopamine inhibits prolactin)", "Stalk lesions: hypopituitarism with raised prolactin."],
  ["Retinohypothalamic tract", "Hypothalamic", "Melanopsin retinal ganglion cells", "Optic nerve → chiasm → leaves dorsally", "Partly crossed", "Suprachiasmatic nucleus", "Disturbed circadian rhythm."],
  ["Nigrostriatal pathway", "Basal ganglia", "Substantia nigra pars compacta", "Medial forebrain region → striatum", "None", "Caudate and putamen (dopamine)", "Parkinsonism."],
  ["Ansa and fasciculus lenticularis (thalamic fasciculus)", "Basal ganglia", "Internal globus pallidus", "Around (ansa) or through (fasciculus) the internal capsule → H fields of Forel", "None", "VA and VL thalamus", "Movement disorders; target region for some surgical therapies."],
  ["Mesolimbic and mesocortical pathways", "Basal ganglia", "Ventral tegmental area", "Medial forebrain bundle", "None", "Nucleus accumbens, prefrontal cortex", "Motivation and reward; apathy when damaged."]
];

/* Cortex: lobes → regions [region, location, function, lesion] */
R.cortex = [
  {lobe:"Frontal lobe", art:"ACA (medial surface), MCA superior division (convexity)", rows:[
    ["Primary motor cortex (M1)", "Precentral gyrus, Brodmann 4; leg medial (paracentral), hand on the convexity, face lowest", "Voluntary movement", "Opposite weakness in the matching body part; focal motor seizures (Jacksonian march)."],
    ["Premotor cortex", "Brodmann 6, in front of M1 on the convexity", "Planning movement to external cues", "Limb-kinetic apraxia, mild proximal weakness."],
    ["Supplementary motor area", "Medial Brodmann 6", "Self-initiated and sequenced movement", "Akinesia, transcortical motor aphasia (left), alien hand (with callosum), leg weakness."],
    ["Frontal eye field", "Posterior middle frontal gyrus, Brodmann 8", "Voluntary saccades to the opposite side", "Acute gaze deviation toward the lesion; seizures drive the eyes away."],
    ["Broca area", "Left inferior frontal gyrus, pars opercularis and triangularis (44, 45)", "Speech production, syntax", "Nonfluent agrammatic aphasia with apraxia of speech; right homologue: expressive aprosodia."],
    ["Dorsolateral prefrontal cortex", "Brodmann 9, 46", "Executive function, working memory, planning", "Dorsolateral (dysexecutive) syndrome: poor planning, perseveration, set-shifting failure, poor verbal fluency."],
    ["Orbitofrontal cortex", "Brodmann 11, 12, 47", "Social behaviour, reward value, inhibition", "Orbitofrontal (disinhibited) syndrome: impulsivity, poor judgment, utilization behaviour, inappropriate jocularity."],
    ["Anterior cingulate and medial prefrontal cortex", "Brodmann 24, 32, medial 9–10", "Motivation, initiation, conflict monitoring", "Medial frontal (apathetic) syndrome: abulia; akinetic mutism if bilateral; urinary incontinence."],
    ["Frontal release and gait signs", "Diffuse or bilateral frontal", "", "Grasp, palmomental, snout and suck reflexes; magnetic (frontal) gait; paratonia (gegenhalten)."],
    ["Foster Kennedy syndrome", "Olfactory groove or sphenoid wing mass", "", "Same-side optic atrophy and anosmia with papilledema in the other eye."]
  ]},
  {lobe:"Parietal lobe", art:"MCA (superior and inferior divisions), ACA (medial), PCA (parieto-occipital)", rows:[
    ["Primary somatosensory cortex (S1)", "Postcentral gyrus, Brodmann 3, 1, 2", "Discriminative touch and position", "Opposite cortical sensory loss: astereognosis, agraphesthesia, impaired two-point discrimination, extinction to double simultaneous stimulation."],
    ["Superior parietal lobule", "Brodmann 5, 7", "Visually guided reaching, body schema", "Optic ataxia; with bilateral damage, Balint syndrome."],
    ["Supramarginal gyrus", "Brodmann 40", "Phonology (left), spatial attention (right)", "Conduction aphasia and ideomotor apraxia (left); neglect (right)."],
    ["Angular gyrus", "Brodmann 39", "Reading, writing, calculation (left)", "Gerstmann syndrome (agraphia, acalculia, finger agnosia, left-right confusion); alexia with agraphia; anomic aphasia (left)."],
    ["Right parietal (non-dominant) syndrome", "Right inferior parietal lobule and temporoparietal junction", "Spatial attention", "Left hemispatial neglect, anosognosia, asomatognosia, dressing and constructional apraxia, motor impersistence."],
    ["Ideomotor apraxia", "Left inferior parietal lobule and its frontal connections", "Praxis", "Cannot pantomime or imitate learned gestures despite intact strength and comprehension."],
    ["Balint syndrome", "Bilateral parieto-occipital (watershed)", "", "Optic ataxia, oculomotor apraxia (psychic paralysis of gaze), simultanagnosia."],
    ["Parietal visual signs", "Deep parietal white matter", "", "Opposite inferior quadrantanopia; asymmetric OKN (Cogan sign)."]
  ]},
  {lobe:"Temporal lobe", art:"MCA inferior division (lateral), PCA (inferior and medial), anterior choroidal (uncus, hippocampal head)", rows:[
    ["Primary auditory cortex", "Heschl gyrus, Brodmann 41, 42", "Hearing", "Unilateral: little hearing loss. Bilateral: cortical deafness or auditory agnosia."],
    ["Wernicke area", "Left posterior superior temporal gyrus, Brodmann 22", "Language comprehension", "Fluent aphasia with poor comprehension and repetition, neologisms; often superior quadrantanopia."],
    ["Hippocampus and medial temporal lobe", "Hippocampus, entorhinal and parahippocampal cortex", "Episodic memory", "Anterograde amnesia (verbal if left, visuospatial if right; severe if bilateral)."],
    ["Amygdala", "Anterior medial temporal lobe", "Fear, emotional memory", "Bilateral: Klüver–Bucy syndrome (placidity, hyperorality, hypersexuality, visual agnosia)."],
    ["Fusiform gyrus", "Ventral temporo-occipital", "Faces (right), words (left visual word form area)", "Prosopagnosia (right or bilateral), pure alexia (left)."],
    ["Anterior temporal pole", "Brodmann 38", "Semantic memory", "Semantic dementia pattern: loss of word meaning and object knowledge."],
    ["Meyer loop", "Temporal stem", "Inferior optic radiation", "Opposite superior quadrantanopia (pie in the sky)."]
  ]},
  {lobe:"Occipital lobe", art:"PCA calcarine (P4) and parieto-occipital branches; occipital pole often dual MCA–PCA", rows:[
    ["Primary visual cortex (V1)", "Calcarine banks, Brodmann 17", "Vision", "Opposite congruous homonymous hemianopia, often macular sparing; cuneus → lower quadrant, lingual → upper quadrant."],
    ["Bilateral V1", "Both occipital lobes (top-of-basilar)", "", "Cortical blindness with normal pupils; Anton syndrome (denial); Riddoch phenomenon (motion seen in blind field)."],
    ["V4 (lingual and fusiform)", "Ventromedial occipitotemporal", "Colour", "Achromatopsia in the opposite field (often with superior quadrantanopia)."],
    ["V5/MT", "Lateral occipitotemporal junction", "Motion", "Akinetopsia (bilateral); impaired pursuit toward the lesion."],
    ["Alexia without agraphia", "Left occipital cortex plus splenium (left PCA)", "", "Can write but cannot read what was written; right hemianopia; colour anomia."],
    ["Visual agnosia", "Bilateral occipitotemporal (ventral stream)", "", "Apperceptive or associative failure to recognize objects despite vision."]
  ]},
  {lobe:"Insula and limbic lobe", art:"MCA M2 insular branches; ACA and PCA for cingulate", rows:[
    ["Anterior insula", "Deep to the frontal operculum", "Speech planning, interoception, taste", "Apraxia of speech (left), taste disturbance, autonomic and cardiac effects (right)."],
    ["Papez circuit", "Hippocampus → fornix → mammillary body → mammillothalamic tract → anterior thalamus → cingulum → parahippocampal gyrus", "Memory", "Amnesia from damage at any station."]
  ]},
  {lobe:"Disconnection syndromes", art:"Mainly ACA (callosum body and genu), PCA (splenium)", rows:[
    ["Anterior callosal syndrome", "Body and genu of the corpus callosum", "", "Left-hand ideomotor apraxia, agraphia and tactile anomia; intermanual conflict (alien hand)."],
    ["Posterior callosal (splenial) syndrome", "Splenium", "", "Left visual field anomia; with left occipital damage, alexia without agraphia."],
    ["Conduction aphasia", "Arcuate fasciculus or supramarginal gyrus (left)", "", "Poor repetition with fluent speech and good comprehension."],
    ["Pure word deafness", "Bilateral or left superior temporal (auditory input to Wernicke area)", "", "Cannot understand spoken words, but reads, writes and speaks."],
    ["Transcortical aphasias", "Watershed zones around the perisylvian language areas", "", "Motor (ACA–MCA): sparse speech, repetition preserved. Sensory (MCA–PCA): poor comprehension, repetition preserved."]
  ]}
];

/* Thalamus: [nucleus, input, output, function, lesion, artery] */
R.thalamus = [
  ["Anterior nucleus", "Mammillary body (mammillothalamic tract)", "Cingulate gyrus", "Memory (Papez circuit)", "Anterograde amnesia, apathy", "Tuberothalamic (polar) artery, from the PComm"],
  ["Ventral anterior (VA)", "Globus pallidus interna, substantia nigra reticulata", "Premotor and prefrontal cortex", "Motor planning", "Abulia, language and motor initiation deficits", "Tuberothalamic (polar) artery"],
  ["Ventral lateral (VL / VIM)", "Dentate nucleus (crossed), globus pallidus", "Motor cortex", "Motor coordination", "Opposite ataxia and tremor (thalamic ataxia); DBS target for tremor", "Inferolateral (thalamogeniculate) arteries, P2"],
  ["Ventral posterolateral (VPL)", "Medial lemniscus, spinothalamic tract", "Postcentral gyrus (body)", "Body sensation", "Opposite hemisensory loss; later central pain (Dejerine–Roussy)", "Inferolateral (thalamogeniculate) arteries, P2"],
  ["Ventral posteromedial (VPM)", "Trigeminal lemnisci; taste (solitary nucleus)", "Postcentral gyrus (face), insula", "Face sensation, taste", "Opposite facial and perioral numbness (cheiro-oral syndrome with VPL)", "Inferolateral (thalamogeniculate) arteries, P2"],
  ["Mediodorsal (MD)", "Amygdala, prefrontal cortex, basal forebrain", "Prefrontal cortex", "Executive function, memory, motivation", "Apathy, amnesia, disinhibition; bilateral: severe akinetic or amnestic state", "Paramedian (thalamoperforating) arteries, P1; artery of Percheron"],
  ["Intralaminar nuclei (centromedian, parafascicular)", "Reticular formation, globus pallidus", "Striatum, widespread cortex", "Arousal and attention", "Hypersomnolence, coma if bilateral", "Paramedian arteries, P1"],
  ["Pulvinar", "Superior colliculus, visual association cortex", "Parietal, temporal and occipital association cortex", "Visual attention, language", "Neglect, thalamic aphasia (left)", "Posterior choroidal arteries (P2)"],
  ["Lateral geniculate nucleus", "Optic tract", "Calcarine cortex (optic radiation)", "Vision", "Opposite homonymous hemianopia; quadruple sectoranopia (AChA) or horizontal sectoranopia (lateral posterior choroidal)", "Anterior choroidal and lateral posterior choroidal arteries"],
  ["Medial geniculate nucleus", "Inferior colliculus", "Heschl gyrus", "Hearing", "Little deficit unless bilateral", "Posterior choroidal and thalamogeniculate arteries"],
  ["Reticular nucleus", "Thalamocortical and corticothalamic collaterals", "Other thalamic nuclei (GABA)", "Gating, sleep spindles", "Contributes to attention and sleep disturbances", "Variable"]
];
R.thalSyndromes = [
  ["Tuberothalamic (polar) infarct", "Anterior nucleus, VA, ventral MD, mammillothalamic tract", "Apathy, perseveration, anterograde amnesia, superimposition of unrelated information; aphasia if left", "Tuberothalamic (polar) artery from the PComm (absent in about a third, then supplied by the paramedian artery)"],
  ["Paramedian infarct", "MD, intralaminar nuclei, rostral midbrain if extended", "Hypersomnolence, vertical gaze palsy, amnesia, apathy; bilateral with an artery of Percheron", "Paramedian (thalamoperforating) arteries from P1; artery of Percheron"],
  ["Inferolateral infarct", "VPL, VPM, VL", "Pure sensory or sensorimotor stroke, thalamic ataxia, later central post-stroke pain (Dejerine–Roussy)", "Inferolateral (thalamogeniculate) arteries from P2"],
  ["Posterior infarct", "Pulvinar, LGN, posterior nuclei", "Visual field defects (sectoranopia), neglect, thalamic aphasia", "Posterior choroidal arteries (medial and lateral) from P2"]
];

/* Hypothalamus: [nucleus, location, function, lesion] */
R.hypothalamus = [
  ["Suprachiasmatic nucleus", "Anterior (chiasmatic) region, above the chiasm", "Circadian pacemaker (retinohypothalamic input)", "Loss of sleep-wake rhythm"],
  ["Supraoptic nucleus", "Anterior region, above the optic tract", "ADH (vasopressin) and oxytocin to the posterior pituitary", "Central diabetes insipidus"],
  ["Paraventricular nucleus", "Anterior region beside the third ventricle", "ADH, oxytocin, CRH, TRH; autonomic output (hypothalamospinal)", "Diabetes insipidus, adrenal and thyroid failure, autonomic disturbance"],
  ["Preoptic and anterior nuclei", "Anterior region", "Heat loss, sleep onset (ventrolateral preoptic), sexual behaviour, GnRH", "Hyperthermia, insomnia, hypogonadism"],
  ["Ventromedial nucleus", "Tuberal region", "Satiety", "Hyperphagia and obesity, rage"],
  ["Arcuate (infundibular) nucleus", "Tuberal region at the median eminence", "Releasing hormones; dopamine inhibits prolactin; appetite (leptin)", "Hypopituitarism, hyperprolactinemia, obesity"],
  ["Lateral hypothalamic area", "Lateral to the fornix", "Hunger, arousal (orexin/hypocretin neurons)", "Anorexia, weight loss; narcolepsy with cataplexy (orexin loss)"],
  ["Dorsomedial nucleus", "Tuberal region", "Feeding, circadian integration", "Aggression, disturbed rhythms"],
  ["Posterior hypothalamic nucleus", "Mammillary region", "Heat conservation, arousal (tuberomammillary histamine)", "Poikilothermia, hypersomnolence"],
  ["Mammillary bodies", "Posterior", "Memory (Papez circuit)", "Anterograde amnesia (Wernicke–Korsakoff)"]
];

/* Autonomic */
R.autonomic = [
  {name:"Sympathetic to the eye and face (oculosympathetic)", steps:[
    ["First-order neuron", "Posterolateral hypothalamus → lateral brainstem tegmentum → lateral cord → ciliospinal center of Budge (C8–T2)", "Lateral medullary infarct, pontine and midbrain lesions, cervical cord lesions, syrinx; central Horner with body hemianhidrosis"],
    ["Second-order (preganglionic) neuron", "T1 ventral root → over the lung apex → sympathetic chain → superior cervical ganglion at the carotid bifurcation (C3–C4)", "Pancoast tumor, neck and chest surgery, trauma, birth injury; facial anhidrosis"],
    ["Third-order (postganglionic) neuron", "Along the internal carotid → cavernous sinus (briefly with CN VI) → V1 (nasociliary) → long ciliary nerves (dilator) and Müller muscle", "Carotid dissection (painful Horner), cavernous sinus lesions, cluster headache; facial sweating mostly spared"]
  ]},
  {name:"Sympathetic to the body", steps:[
    ["Central", "Hypothalamus and brainstem (rostral ventrolateral medulla) → reticulospinal and hypothalamospinal tracts", "Brainstem or cord lesions: orthostatic hypotension, autonomic dysreflexia above T6"],
    ["Preganglionic", "Intermediolateral column T1–L2 → white rami → paravertebral chain or splanchnic nerves", "Spinal cord injury, multiple system atrophy"],
    ["Postganglionic", "Chain and prevertebral ganglia (celiac, mesenteric) → gray rami → sweat glands, vessels, viscera", "Small-fiber neuropathies (diabetes, amyloid), pure autonomic failure"]
  ]},
  {name:"Parasympathetic (craniosacral)", steps:[
    ["CN III", "Edinger–Westphal nucleus → oculomotor nerve (superficial fibers) → ciliary ganglion → short ciliary nerves", "Pupil sphincter and accommodation: dilated pupil with compression, Adie tonic pupil"],
    ["CN VII", "Superior salivatory nucleus → nervus intermedius → pterygopalatine ganglion (lacrimal) and submandibular ganglion", "Dry eye or mouth with proximal facial nerve lesions"],
    ["CN IX", "Inferior salivatory nucleus → otic ganglion", "Parotid secretion"],
    ["CN X", "Dorsal motor nucleus of the vagus and nucleus ambiguus → thoracic and abdominal viscera", "Heart rate, gut motility; loss causes tachycardia and dysmotility"],
    ["Sacral S2–S4", "Sacral parasympathetic nucleus → pelvic splanchnic nerves", "Bladder, bowel and sexual function; conus and cauda equina lesions"]
  ]},
  {name:"Bladder control", steps:[
    ["Cortex", "Medial frontal lobe (paracentral and anterior cingulate)", "Lesion: urge incontinence without awareness (uninhibited bladder)"],
    ["Pontine micturition center", "Dorsal pontine tegmentum (Barrington nucleus)", "Coordinates detrusor contraction with sphincter relaxation"],
    ["Spinal cord", "Between pons and sacral cord", "Detrusor–sphincter dyssynergia, spastic bladder"],
    ["Sacral cord and nerves", "S2–S4", "Flaccid, overdistended bladder with overflow"]
  ]}
];

/* Vessels: [artery, segment/branch, territory, syndrome] */
R.vessels = [
  ["ICA", "Superior hypophyseal arteries", "Pituitary stalk, optic chiasm (inferior)", "Rarely isolated; chiasmal ischemia"],
  ["ICA", "Ophthalmic artery", "Globe, retina (central retinal artery), orbit", "Amaurosis fugax, central retinal artery occlusion"],
  ["ICA", "Posterior communicating artery: tuberothalamic (polar) and anterior thalamoperforating branches", "Anterior thalamus, hypothalamus, mammillothalamic tract", "Tuberothalamic infarct: apathy, amnesia; PComm aneurysm: pupil-involving third nerve palsy"],
  ["ICA", "Anterior choroidal artery", "Posterior two-thirds of the posterior limb, retrolenticular capsule, optic tract, LGN (lateral), medial pallidum, tail of caudate, uncus, hippocampal head, choroid plexus", "Hemiparesis, hemisensory loss, homonymous hemianopia (quadruple sectoranopia), language spared"],
  ["ACA", "A1: medial lenticulostriate arteries", "Anteroinferior striatum, anterior limb, anterior hypothalamus", "Abulia, face and arm weakness"],
  ["ACA", "Recurrent artery of Heubner (A1–A2 junction)", "Head of caudate (anteroinferior), anterior limb, anterior putamen and pallidum", "Face and arm weakness, dysarthria, abulia; aphasia-like deficits if left"],
  ["ACA", "Anterior communicating artery: subcallosal, hypothalamic and septal perforators", "Septal nuclei, fornix columns, anterior hypothalamus, genu (lower)", "Amnesia and confabulation after ACoA aneurysm rupture"],
  ["ACA", "A2–A3: orbitofrontal, frontopolar, pericallosal and callosomarginal arteries", "Medial frontal and parietal cortex (including paracentral lobule), anterior four-fifths of the corpus callosum", "Leg more than arm weakness and sensory loss, abulia, urinary incontinence, transcortical motor aphasia, alien hand"],
  ["MCA", "M1: lateral lenticulostriate arteries", "Putamen, lateral pallidum, upper internal capsule, body of caudate, corona radiata near them", "Pure motor lacunes, striatocapsular infarcts, hypertensive putaminal hemorrhage"],
  ["MCA", "M2 superior division (orbitofrontal, prefrontal, precentral, central, anterior parietal branches)", "Lateral frontal lobe, rolandic cortex, anterior parietal", "Opposite face and arm more than leg weakness and sensory loss, gaze deviation toward the lesion, Broca aphasia (left) or neglect (right)"],
  ["MCA", "M2 inferior division (temporal, posterior parietal, angular branches)", "Lateral temporal lobe, inferior parietal lobule", "Wernicke aphasia (left), neglect and confusion (right), superior quadrantanopia; little weakness"],
  ["MCA", "M2 insular segment (short insular arteries)", "Insula, claustrum, extreme capsule", "Taste, autonomic and speech planning disturbances"],
  ["MCA", "Medullary (superficial perforating) arteries", "Deep white matter of the corona radiata", "Internal border zone (chain-like) infarcts with hypoperfusion"],
  ["PCA", "P1: thalamoperforating (paramedian) arteries; artery of Percheron", "Medial thalamus (MD, intralaminar), rostral midbrain", "Paramedian thalamic syndrome; bilateral with the artery of Percheron (coma, vertical gaze palsy, amnesia)"],
  ["PCA", "P1: mesencephalic paramedian perforators and quadrigeminal (collicular) artery", "Third nerve nucleus and fascicle, red nucleus, medial peduncle; tectum", "Weber, Benedikt, Claude, Parinaud syndromes"],
  ["PCA", "P2: thalamogeniculate (inferolateral) arteries", "VPL, VPM, VL, posterior internal capsule", "Pure sensory stroke, sensorimotor stroke, thalamic ataxia, Dejerine–Roussy pain"],
  ["PCA", "P2: posterior choroidal arteries (medial and lateral)", "Pulvinar, LGN (medial part, lateral posterior choroidal), posterior thalamus, tectum, choroid plexus", "Horizontal sectoranopia, neglect, memory problems"],
  ["PCA", "P2–P3: anterior and posterior temporal and hippocampal branches", "Inferior and medial temporal lobe, hippocampus", "Amnesia, visual agnosia, prosopagnosia"],
  ["PCA", "P4: calcarine and parieto-occipital arteries; posterior pericallosal (splenial) artery", "Calcarine cortex, cuneus, precuneus (posterior), splenium", "Opposite homonymous hemianopia with macular sparing; alexia without agraphia (left with splenium)"],
  ["Basilar", "Paramedian perforating branches", "Medial pons and midbrain: corticospinal tract, medial lemniscus, MLF, abducens nucleus, PPRF", "Ventral pontine syndromes, ataxic hemiparesis, Raymond, Millard–Gubler, Foville, INO, locked-in"],
  ["Basilar", "Short circumferential branches", "Anterolateral pons and midbrain: lateral basis, facial fascicle exit, spinothalamic tract", "Contributes to lateral basis and lateral tegmental syndromes"],
  ["Basilar", "Long circumferential branches", "Lateral and dorsolateral midpontine tegmentum", "Lateral midpontine syndrome: facial numbness, chewing weakness, ataxia"],
  ["Basilar", "Superior cerebellar artery (SCA)", "Superior cerebellum, dentate nucleus, superior peduncle, dorsolateral rostral pons and caudal midbrain", "Same-side ataxia, dysarthria and Horner; opposite pain and temperature loss; sometimes a fourth nerve palsy"],
  ["Basilar", "Anterior inferior cerebellar artery (AICA) and labyrinthine artery", "Lateral caudal pons (facial, vestibular and cochlear nuclei, spinal V, sympathetic), MCP, flocculus, inner ear", "Lateral inferior pontine syndrome: vertigo, same-side deafness, facial palsy, facial numbness, Horner, ataxia; opposite pain and temperature loss"],
  ["Basilar", "Top of the basilar", "Rostral midbrain, both thalami, both occipital and medial temporal lobes", "Somnolence, vertical gaze palsy, pupil changes, peduncular hallucinosis, cortical blindness, amnesia"],
  ["Vertebral", "Posterior inferior cerebellar artery (PICA)", "Dorsolateral medulla, inferior cerebellum, inferior vermis, tonsil", "Lateral medullary syndrome; medial branch: isolated vertigo with truncal ataxia (pseudo-vestibular neuritis)"],
  ["Vertebral", "Direct lateral medullary branches", "Ventrolateral and lateral medulla", "Lateral medullary syndrome (more often from vertebral than PICA occlusion)"],
  ["Vertebral", "Anterior spinal artery (and paramedian vertebral branches)", "Medial medulla (pyramid, medial lemniscus, hypoglossal), anterior two-thirds of the cord", "Medial medullary syndrome; anterior cord syndrome (paralysis and pain-temperature loss below, posterior columns spared)"],
  ["Vertebral", "Posterior spinal arteries", "Gracile and cuneate nuclei, dorsal columns, dorsal horns", "Loss of vibration and position sense, sensory ataxia"]
];

/* Brainstem syndromes by level: [level, syndrome, structures, findings, artery] */
R.bsyn = [
  ["Upper midbrain", "Weber", "Cerebral peduncle + CN III fascicle", "Same-side third nerve palsy, opposite hemiparesis (face, arm, leg)", "Paramedian P1 / basilar tip perforators"],
  ["Upper midbrain", "Claude", "Dorsal red nucleus, superior peduncle fibers + CN III", "Same-side third nerve palsy, opposite ataxia", "Paramedian P1 perforators"],
  ["Upper midbrain", "Benedikt", "Red nucleus + CN III (± peduncle)", "Same-side third nerve palsy, opposite tremor, chorea, ataxia (± hemiparesis)", "Paramedian P1 / basilar tip perforators"],
  ["Upper midbrain", "Nothnagel", "Superior peduncle region + CN III (tectal)", "Third nerve palsy with same-side or bilateral ataxia", "Quadrigeminal artery; tectal tumors"],
  ["Upper midbrain", "Parinaud (dorsal midbrain)", "Posterior commissure, pretectum", "Upgaze palsy, light-near dissociation, convergence-retraction nystagmus, lid retraction", "Pineal tumor, hydrocephalus; posterior choroidal / quadrigeminal arteries"],
  ["Upper midbrain", "Top of the basilar", "Rostral midbrain, thalami, occipital lobes", "Somnolence, vertical gaze palsy, hallucinosis, cortical blindness, amnesia", "Distal basilar embolism"],
  ["Lower midbrain", "Wernekink commissure", "Decussation of the superior cerebellar peduncles", "Bilateral ataxia, dysarthria, ± bilateral INO, later palatal tremor", "Paramedian basilar perforators"],
  ["Lower midbrain", "Trochlear nucleus syndrome", "CN IV nucleus/fascicle + descending sympathetic fibers", "Opposite superior oblique palsy, same-side Horner", "Paramedian basilar / SCA"],
  ["Upper pons", "Raymond–Céstan (upper dorsal pontine)", "Superior and middle peduncles, medial lemniscus, spinothalamic tract (± CST, MLF)", "Same-side ataxia, opposite sensory loss, ± hemiparesis and gaze palsy", "SCA and long circumferential branches"],
  ["Upper / middle pons", "Ataxic hemiparesis; dysarthria–clumsy hand", "Basis pontis: CST + pontine nuclei", "Opposite weakness with disproportionate ataxia; or dysarthria with a clumsy hand", "Paramedian basilar perforators (lacune)"],
  ["Middle pons", "Lateral midpontine", "Trigeminal nuclei and root + MCP", "Same-side facial numbness, weak chewing, limb ataxia", "Short / long circumferential basilar branches"],
  ["Upper pons", "Superior medial pontine", "CST + MLF (± MCP, central tegmental tract)", "Opposite face, arm and leg weakness, same-side INO; sometimes ataxia and palatal myoclonus", "Paramedian branches of the upper basilar artery"],
  ["Upper pons", "Superior lateral pontine (SCA)", "Superior cerebellar peduncle, lateral lemniscus, spinothalamic and trigeminothalamic tracts, sympathetic fibers", "Same-side ataxia, Horner and nystagmus; opposite pain and temperature loss in face and body; reduced hearing", "Superior cerebellar artery"],
  ["Middle pons", "Medial midpontine", "CST + medial lemniscus (± pontine nuclei)", "Opposite hemiparesis and proprioceptive loss, ± ataxia", "Paramedian basilar branches"],
  ["Lower pons", "Gasperini", "Caudal pontine tegmentum: V, VI, VII, VIII nuclei + spinothalamic tract", "Same-side facial numbness, lateral rectus and facial palsy, deafness and vertigo; opposite hemisensory loss", "AICA / long circumferential basilar branches"],
  ["Lower pons", "Marie–Foix (lateral pontine)", "Middle cerebellar peduncle + CST + spinothalamic tract", "Same-side ataxia, opposite hemiparesis, opposite pain and temperature loss", "Short circumferential branches or AICA"],
  ["Pontomedullary junction", "Cerebellopontine angle (AICA)", "VII and VIII roots, cochlear nuclei, spinal trigeminal, ICP", "Same-side deafness, tinnitus, vertigo, facial palsy, facial numbness, ataxia", "AICA and labyrinthine artery; or a CPA mass"],
  ["Pontomedullary junction", "Vestibular nuclear (pseudo-vestibular neuritis)", "Medial, lateral and inferior vestibular nuclei", "Acute vertigo and nystagmus mimicking vestibular neuritis; HINTS points to stroke", "AICA or PICA medial branches"],
  ["Lower pons", "Millard–Gubler", "CN VI and VII fascicles + CST", "Same-side lateral rectus and facial palsy, opposite hemiparesis", "Paramedian / short circumferential basilar branches"],
  ["Lower pons", "Raymond", "CN VI fascicle + CST", "Same-side lateral rectus palsy, opposite hemiparesis", "Paramedian basilar branches"],
  ["Lower pons", "Foville", "Abducens nucleus / PPRF + facial nucleus or genu (± CST)", "Same-side gaze palsy and facial palsy (± opposite hemiparesis)", "Paramedian and short circumferential basilar branches; AICA"],
  ["Lower pons", "One-and-a-half / eight-and-a-half", "Abducens nucleus or PPRF + MLF (± facial genu)", "Same-side gaze palsy + INO (± facial palsy)", "Paramedian basilar branches; MS"],
  ["Lower pons", "Lateral inferior pontine (AICA)", "Facial, vestibular, cochlear and spinal trigeminal nuclei, MCP, sympathetic, STT", "Vertigo, same-side deafness, facial palsy and numbness, Horner, ataxia; opposite pain and temperature loss", "AICA"],
  ["Pons, bilateral", "Locked-in", "Both basis pontis (CST, corticobulbar)", "Quadriplegia, anarthria; vertical gaze and blinking preserved, awake", "Basilar artery thrombosis"],
  ["Upper medulla", "Lateral medullary (Wallenberg)", "Spinal V, nucleus ambiguus, STT, sympathetic, vestibular nuclei, ICP", "Vertigo, dysphagia, hoarseness, same-side facial pain-temperature loss, Horner and ataxia; opposite body pain-temperature loss", "Vertebral artery > PICA"],
  ["Upper medulla", "Medial medullary (Dejerine)", "Pyramid, medial lemniscus, CN XII", "Same-side tongue weakness, opposite hemiparesis sparing face, opposite vibration and position loss", "Anterior spinal / paramedian vertebral branches"],
  ["Upper medulla", "Babinski–Nageotte (hemimedullary)", "Lateral + medial medulla", "Wallenberg plus opposite hemiparesis", "Intracranial vertebral artery"],
  ["Upper medulla", "Avellis", "Nucleus ambiguus + STT", "Same-side palate and vocal cord palsy, opposite pain-temperature loss", "Vertebral branches / PICA"],
  ["Upper medulla", "Jackson", "CN XII + nucleus ambiguus + pyramid", "Same-side tongue, palate and vocal cord palsy, opposite hemiparesis", "Vertebral / anterior spinal branches"],
  ["Upper medulla", "Upbeat nystagmus (perihypoglossal)", "Nucleus intercalatus and Roller (paramedian caudal medulla)", "Primary-position upbeat nystagmus", "Paramedian vertebral / anterior spinal branches; MS, Wernicke"],
  ["Upper medulla", "Central hypoventilation", "Both ventrolateral medullae (pre-Bötzinger complex, RVLM)", "Loss of automatic breathing in sleep (Ondine curse), labile blood pressure", "Bilateral vertebral branches"],
  ["Middle medulla", "Area postrema", "Area postrema at the obex", "Intractable hiccups, nausea and vomiting", "Posterior spinal / PICA territory; typical of aquaporin-4 NMOSD rather than stroke"],
  ["Lower medulla", "Opalski", "Lateral medulla + lateral corticospinal tract below the decussation", "Wallenberg features plus same-side hemiparesis", "Vertebral artery"],
  ["Lower medulla", "Cruciate paralysis", "Pyramidal decussation", "Arm more than leg weakness, often bilateral", "Anterior spinal artery; craniocervical trauma"],
  ["Lower medulla", "Posterior spinal artery syndrome", "Gracile and cuneate nuclei and fasciculi", "Same-side loss of vibration and position, sensory ataxia", "Posterior spinal artery"]
];

window.LOC_REF = R;
})();
