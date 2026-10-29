/* Score calculators (#/neurology/scores, and #/neurology/scores/<id> for one).

   Tap an answer for each item; the score and what it means show as soon as
   everything is answered, with Copy (for your notes) and Clear. Answers are
   kept while the app is open, so you can step away to look something up —
   nothing is saved or synced. */
import { html, setHTML } from '../../core/html.js';
import { replacePage } from '../../core/router.js';
import { icon } from '../../core/icons.js';
import { subHead } from '../../core/components.js';
import { toast } from '../../core/ui.js';
import { CALCULATORS, GROUPS, calculator, isComplete, resultText } from './scores.js';

const answers = new Map(); // calculator id → { item id: option index | true | number text }
let view = null;
let showing = false;
let calc = null;

const valuesOf = (id) => {
  if (!answers.has(id)) answers.set(id, {});
  return answers.get(id);
};

export const scoresPage = {
  show(el, id) {
    view = el;
    showing = true;
    calc = id ? calculator(id) : null;
    if (id && !calc) {
      replacePage('scores');
      return;
    }
    render();
  },
  hide() {
    showing = false;
  },
};

/* ---------- The list ---------- */

function listPage() {
  return html`<div class="sc-page accent-neuro">
    ${subHead({ title: 'Score calculators', back: 'Neurology', fallback: '', accent: 'neuro', eyebrow: 'Clinical tools' })}
    ${GROUPS.map((g) => html`<section class="sc-group" aria-labelledby="sc-g-${g.id}">
      <h2 class="sc-group__title" id="sc-g-${g.id}">${g.name}</h2>
      <ul class="sc-list">${CALCULATORS.filter((c) => c.group === g.id).map((c) => html`<li>
        <a class="card sc-link" href="#/neurology/scores/${c.id}" data-action="nav" data-route="neurology" data-sub="scores/${c.id}">
          <span class="sc-link__text"><span class="sc-link__name">${c.name}</span><span class="sc-link__full">${c.full}</span></span>
          ${Object.keys(valuesOf(c.id)).length ? html`<span class="badge sc-link__badge">In progress</span>` : ''}
          ${icon('chevronRight', 'sc-link__chev')}
        </a></li>`)}</ul>
    </section>`)}
    <p class="sc-foot">${icon('info')}<span>A quick aid. Always check against the original scale and your hospital’s protocol.</span></p>
  </div>`;
}

/* ---------- One calculator ---------- */

function itemMarkup(it, values) {
  if (it.kind === 'check') {
    const on = Boolean(values[it.id]);
    return html`<li><button type="button" class="sc-check${on ? ' is-on' : ''}" role="checkbox" aria-checked="${on ? 'true' : 'false'}" data-scact="check" data-item="${it.id}">
      <span class="pt__box">${icon('check')}</span><span class="sc-check__code">${it.short}</span><span class="sc-check__label">${it.label.replace(/^\w+ — /, '')}</span>
    </button></li>`;
  }
  if (it.kind === 'number') {
    return html`<label class="sc-item sc-num"><span class="sc-item__label">${it.label}</span>
      <span class="sc-num__box"><input class="input sc-num__input" type="number" inputmode="decimal" min="${it.min}" max="${it.max}" step="${it.step}" value="${values[it.id] ?? ''}" data-scnum="${it.id}" aria-label="${it.label} in ${it.unit}"><span class="sc-num__unit">${it.unit}</span></span>
    </label>`;
  }
  const skipped = it.optional?.(values);
  return html`<fieldset class="sc-item${skipped ? ' is-skipped' : ''}" data-item="${it.id}">
    <legend class="sc-item__label">${it.label}</legend>
    ${it.hint ? html`<p class="sc-item__hint">${it.hint}</p>` : ''}
    <div class="sc-opts" role="radiogroup" aria-label="${it.label}">${it.options.map((o, i) => {
      const on = values[it.id] === i;
      const pts = o.un ? (typeof o.un === 'string' ? o.un : 'UN') : String(o.v);
      return html`<button type="button" class="sc-opt${on ? ' is-on' : ''}" role="radio" aria-checked="${on ? 'true' : 'false'}" data-scact="pick" data-item="${it.id}" data-i="${i}">
        <span class="sc-opt__pts" aria-hidden="true">${pts}</span><span class="sc-opt__label">${o.label.replace(/^\d — /, '')}</span>
      </button>`;
    })}</div>
  </fieldset>`;
}

function resultMarkup() {
  const values = valuesOf(calc.id);
  if (!isComplete(calc, values)) {
    const left = calc.items.filter((it) => it.kind !== 'check' && !it.optional?.(values) && (values[it.id] == null || values[it.id] === '')).length;
    return html`<div class="sc-result__score is-empty"><span class="sc-result__big">—</span></div>
      <div class="sc-result__text"><p class="sc-result__meaning">${calc.items.every((it) => it.kind === 'number') ? 'Type the numbers above' : `Answer ${left} more ${left === 1 ? 'item' : 'items'} to see the result`}</p></div>`;
  }
  const r = calc.result(values);
  return html`<div class="sc-result__score${r.tone ? ` is-${r.tone}` : ''}"><span class="sc-result__big">${r.big}</span>${r.unit ? html`<span class="sc-result__unit">${r.unit}</span>` : ''}</div>
    <div class="sc-result__text"><p class="sc-result__meaning">${r.meaning}</p></div>`;
}

/** The longer explanation (doses, risks), under the questions — the box at the bottom stays one line. */
function linesMarkup() {
  const values = valuesOf(calc.id);
  const lines = isComplete(calc, values) ? calc.result(values).lines ?? [] : [];
  return lines.length ? html`<div class="card sc-lines">${lines.map((l) => html`<p class="sc-lines__line">${l}</p>`)}</div>` : '';
}

function calcPage() {
  const values = valuesOf(calc.id);
  const checks = calc.items.every((it) => it.kind === 'check');
  return html`<div class="sc-page sc-page--calc accent-neuro">
    ${subHead({ title: calc.full, back: 'Scores', fallback: 'scores', accent: 'neuro', eyebrow: calc.name })}
    ${calc.note ? html`<p class="sc-note">${calc.note}</p>` : ''}
    ${checks ? html`<ul class="sc-checks" aria-label="Regions">${calc.items.map((it) => itemMarkup(it, values))}</ul>` : html`<div class="sc-items">${calc.items.map((it) => itemMarkup(it, values))}</div>`}
    <div data-sc-lines aria-live="polite">${linesMarkup()}</div>
    <section class="card sc-result" aria-live="polite" aria-label="Result">
      <div class="sc-result__main" data-sc-result>${resultMarkup()}</div>
      <div class="sc-result__actions">
        <button type="button" class="btn btn--sm btn--primary" data-scact="copy">${icon('copy')}Copy</button>
        <button type="button" class="icon-btn sc-result__clear" data-scact="clear" aria-label="Clear the answers">${icon('refresh')}</button>
      </div>
    </section>
    <p class="sc-foot">${icon('book')}<span>${calc.source}. A quick aid — always check against the original scale and your hospital’s protocol.</span></p>
  </div>`;
}

function render() {
  if (!view || !showing) return;
  setHTML(view, calc ? calcPage() : listPage());
}

/** After an answer: the result, and which items are skipped (WFNS motor deficit). */
function refresh() {
  const box = view?.querySelector('[data-sc-result]');
  if (box) setHTML(box, resultMarkup());
  const lines = view?.querySelector('[data-sc-lines]');
  if (lines) setHTML(lines, linesMarkup());
  const values = valuesOf(calc.id);
  for (const it of calc.items) {
    if (!it.optional) continue;
    view.querySelector(`.sc-item[data-item="${it.id}"]`)?.classList.toggle('is-skipped', Boolean(it.optional(values)));
  }
}

async function copy() {
  const values = valuesOf(calc.id);
  if (!isComplete(calc, values)) { toast('Answer every item first.'); return; }
  const text = resultText(calc, values);
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied — paste it into your notes', { icon: 'check' });
  } catch {
    toast(text, { duration: 10000 });
  }
}

function onClick(e) {
  const btn = e.target.closest('[data-scact]');
  if (!btn || !view?.contains(btn) || !calc) return;
  const values = valuesOf(calc.id);
  const { scact, item } = btn.dataset;
  if (scact === 'pick') {
    values[item] = Number(btn.dataset.i);
    btn.closest('.sc-opts')?.querySelectorAll('.sc-opt').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    refresh();
  } else if (scact === 'check') {
    values[item] = !values[item];
    btn.classList.toggle('is-on', values[item]);
    btn.setAttribute('aria-checked', values[item] ? 'true' : 'false');
    refresh();
  } else if (scact === 'copy') {
    copy();
  } else if (scact === 'clear') {
    const before = { ...values };
    answers.set(calc.id, {});
    render();
    window.scrollTo({ top: 0 });
    if (Object.keys(before).length) {
      toast('Answers cleared', { action: { label: 'Undo', onClick: () => { answers.set(calc.id, before); render(); } } });
    }
  }
}

/** Wired up once by the Neurology screen. */
export function wireScores(el) {
  el.addEventListener('click', onClick);
  el.addEventListener('input', (e) => {
    const id = e.target.dataset?.scnum;
    if (!id || !calc) return;
    valuesOf(calc.id)[id] = e.target.value;
    refresh();
  });
}
