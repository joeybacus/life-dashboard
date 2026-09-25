/* One click listener for the whole app. Any element with data-action="name"
   runs the handler registered under that name: registerAction('name', (el, event) => …). */
const handlers = new Map();

export function registerAction(name, handler) {
  handlers.set(name, handler);
}

export function initActions() {
  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || el.getAttribute('aria-disabled') === 'true') return;
    const handler = handlers.get(el.dataset.action);
    if (!handler) return;
    event.preventDefault();
    handler(el, event);
  });
}
