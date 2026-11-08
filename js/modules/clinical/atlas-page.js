/* Self-contained teaching atlases shown in a frame under the usual Back header:
     #/neurology/eyes        Ocular Motor Atlas — eye movement, pupil and visual pathway lesions,
                             eye simulator, visual fields, nystagmus, quiz
     #/neurology/localizer   Neuro Localizer — draw a lesion on 11 brain and brainstem slices: structures, deficits,
                             syndromes and the arterial branch; reference tables (loads two data scripts beside it)
     #/neurology/cerebellum  Cerebellar Pathways — traced circuits, lesions and which side is
                             affected, anatomy, bedside exam, quiz
   Each atlas is one HTML file next to this one, saved for offline use by the service worker. */
import { html, setHTML } from '../../core/html.js';
import { subHead } from '../../core/components.js';

function framePage({ src, title, label }) {
  return {
    show(el) {
      // Keep the frame (and your place in it) when this page is shown again
      if (el.querySelector(`.atlas-frame[data-src="${src}"]`)) return;
      setHTML(el, html`
        ${subHead({ title, back: 'Neurology', fallback: '', accent: 'neuro', eyebrow: 'Clinical tools' })}
        <div class="atlas-wrap">
          <iframe class="atlas-frame" data-src="${src}" src="${src}" title="${label}" loading="eager"></iframe>
        </div>`);
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
