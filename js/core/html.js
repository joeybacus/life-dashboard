/* Tiny HTML templating.
   html`...` escapes every interpolated value unless it is itself an html`` result
   or wrapped in raw(). That keeps user text (like the nickname) from ever being
   treated as markup. */

class SafeHTML {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** Mark trusted markup (our own SVG icons, attributes we build) as safe. */
export function raw(markup) {
  return new SafeHTML(String(markup ?? ''));
}

function toMarkup(value) {
  if (value == null || value === false || value === true) return '';
  if (value instanceof SafeHTML) return value.value;
  if (Array.isArray(value)) return value.map(toMarkup).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toMarkup(values[i]) + strings[i + 1];
  return new SafeHTML(out);
}

export function setHTML(el, template) {
  el.innerHTML = toMarkup(template);
}

/** Build data-* attributes from an object: dataAttrs({ route: 'todo' }) → data-route="todo" */
export function dataAttrs(obj = {}) {
  return raw(Object.entries(obj)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ` data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${esc(v)}"`)
    .join(''));
}
