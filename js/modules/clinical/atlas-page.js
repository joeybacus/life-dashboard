/* Self-contained teaching atlases shown in a frame under the usual Back header:
     #/neurology/eyes        Ocular Motor Atlas — eye movement, pupil and visual pathway lesions,
                             eye simulator, visual fields, nystagmus, quiz
     #/neurology/localizer   Neuro Localizer — draw a lesion on brain, brainstem and spinal cord slices: structures,
                             deficits, syndromes and the arterial branch; reference tables (loads data scripts beside it)
     #/neurology/cerebellum  Cerebellar Pathways — traced circuits, lesions and which side is
                             affected, anatomy, bedside exam, quiz
   Each atlas is one HTML file next to this one, saved for offline use by the service worker.
   The frame grows to the height of its content (0.11.17), so the page scrolls as one instead of
   a small box scrolling inside it. */
import { html, setHTML } from '../../core/html.js';
import { subHead } from '../../core/components.js';

/** Keep a same-site frame exactly as tall as the page inside it. */
function fitToContent(frame) {
  let watchers = [];
  let queued = false;
  const fit = () => {
    queued = false;
    if (!frame.isConnected) { watchers.forEach((w) => w.disconnect()); watchers = []; return; }
    const body = frame.contentDocument?.body;
    if (!body) return;
    const h = Math.ceil(body.scrollHeight) + (frame.offsetHeight - frame.clientHeight); // plus the frame's border
    if (h > 0 && frame.style.height !== `${h}px`) frame.style.height = `${h}px`;
  };
  const later = () => { if (!queued) { queued = true; setTimeout(fit, 30); } };
  frame.addEventListener('load', () => {
    watchers.forEach((w) => w.disconnect());
    watchers = [];
    const win = frame.contentWindow, doc = frame.contentDocument;
    if (!win || !doc?.body) return; // not readable (should not happen: same site)
    frame.classList.add('is-fitted');
    // Size changes (images, fonts, layout) — the frame's own ResizeObserver, since one from this
    // window doesn't report on the frame's elements…
    const ro = new win.ResizeObserver(later);
    ro.observe(doc.body);
    // …and content changes (tab switches, new slices, reports), which also cover browsers that skip resize callbacks
    const mo = new win.MutationObserver(later);
    mo.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    watchers = [ro, mo];
    win.addEventListener('resize', later);
    fit();
  });
  window.addEventListener('resize', later);
}

function framePage({ src, title, label }) {
  return {
    show(el) {
      // Keep the frame (and your place in it) when this page is shown again
      if (el.querySelector(`.atlas-frame[data-src="${src}"]`)) return;
      setHTML(el, html`
        ${subHead({ title, back: 'Neurology', fallback: '', accent: 'neuro', eyebrow: 'Clinical tools' })}
        <div class="atlas-wrap">
          <iframe class="atlas-frame" data-src="${src}" src="${src}" aria-label="${label}" loading="eager"></iframe>
        </div>`);
      const frame = el.querySelector('.atlas-frame');
      if (frame) fitToContent(frame);
    },
  };
}

export const ATLAS_SRC = 'js/modules/clinical/ocular-motor-atlas.html';
export const CEREBELLUM_SRC = 'js/modules/clinical/cerebellar-pathways.html';
export const LOCALIZER_SRC = 'js/modules/clinical/neuro-localizer.html';

export const atlasPage = framePage({
  src: ATLAS_SRC, title: 'Ocular Motor Atlas',
  label: 'Ocular Motor Atlas: lesion sites, eye findings, visual fields and quiz',
});

export const localizerPage = framePage({
  src: LOCALIZER_SRC, title: 'Neuro Localizer',
  label: 'Neuro Localizer: draw a lesion on brain and brainstem slices; tracts, cortex, thalamus, autonomic, arteries',
});

export const cerebellumPage = framePage({
  src: CEREBELLUM_SRC, title: 'Cerebellar Pathways',
  label: 'Cerebellar Pathways: circuits, lesions, anatomy, bedside exam and quiz',
});
