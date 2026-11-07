/* Ocular Motor Atlas (#/neurology/eyes) — eye movement, pupil and visual pathway
   lesions with their exact locations, a live eye simulator, visual field charts,
   nerve pathways, a nystagmus table and a case quiz.
   The atlas is a self-contained page (ocular-motor-atlas.html, saved for offline
   use by the service worker) shown here in a frame under the usual Back header. */
import { html, setHTML } from '../../core/html.js';
import { subHead } from '../../core/components.js';

export const ATLAS_SRC = 'js/modules/clinical/ocular-motor-atlas.html';

export const atlasPage = {
  show(el) {
    // Keep the frame (and the place you were at in the atlas) when coming back to it
    if (el.querySelector('.atlas-frame')) return;
    setHTML(el, html`
      ${subHead({ title: 'Ocular Motor Atlas', back: 'Neurology', fallback: '', accent: 'neuro', eyebrow: 'Clinical tools' })}
      <div class="atlas-wrap">
        <iframe class="atlas-frame" src="${ATLAS_SRC}" title="Ocular Motor Atlas: lesion sites, eye findings, visual fields and quiz" loading="eager"></iframe>
      </div>`);
  },
};
