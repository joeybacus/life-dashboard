/* Drag-to-reorder for a vertical list (touch, mouse and pen via Pointer Events).
   Drag starts only from an element with [data-drag-handle]; the rest of the page
   keeps scrolling normally. */
import { prefersReducedMotion } from './platform.js';

const EASE = 'cubic-bezier(.2, .8, .2, 1)';

/** Animate list items from their old positions to their new ones after `mutate()` changes the DOM. */
export function animateReorder(list, mutate) {
  const items = [...list.children];
  const before = new Map(items.map((el) => [el, el.getBoundingClientRect().top]));
  mutate();
  if (prefersReducedMotion()) return;
  items.forEach((el) => {
    const delta = before.get(el) - el.getBoundingClientRect().top;
    if (!delta) return;
    el.style.transition = 'none';
    el.style.transform = `translate3d(0, ${delta}px, 0)`;
  });
  void list.offsetHeight;
  items.forEach((el) => {
    if (!el.style.transform) return;
    el.style.transition = `transform 280ms ${EASE}`;
    el.style.transform = '';
    el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
  });
}

/**
 * makeReorderable(list, { canStart, onReorder })
 *   canStart(): whether dragging is currently allowed
 *   onReorder(ids, movedItem): called after a drop that changed the order (ids from data-id)
 */
export function makeReorderable(list, { canStart = () => true, onReorder } = {}) {
  let drag = null;

  const gapOf = () => parseFloat(getComputedStyle(list).rowGap) || 0;

  function onPointerDown(event) {
    const handle = event.target.closest('[data-drag-handle]');
    if (!handle || !list.contains(handle) || !canStart()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const item = handle.closest('li');
    if (!item) return;

    event.preventDefault();
    try { handle.setPointerCapture(event.pointerId); } catch { /* not supported */ }

    const items = [...list.children];
    drag = {
      pointerId: event.pointerId,
      handle,
      item,
      items,
      from: items.indexOf(item),
      to: items.indexOf(item),
      startY: event.clientY,
      startScroll: window.scrollY,
      lastY: event.clientY,
      offset: 0,
      raf: 0,
    };
    item.classList.add('is-dragging');
    list.classList.add('is-drag-active');
    item.style.transition = 'none';
    items.forEach((el) => { if (el !== item) el.style.transition = `transform 220ms ${EASE}`; });

    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerEnd);
    handle.addEventListener('pointercancel', onPointerEnd);
    handle.addEventListener('lostpointercapture', onPointerEnd);
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.lastY = event.clientY;
    layout();
  }

  /** Position the dragged card under the finger and shift the others out of its way. */
  function layout() {
    const { item, items, from } = drag;
    const top0 = item.offsetTop;
    const height = item.offsetHeight;
    const first = items[0];
    const last = items[items.length - 1];
    const minOffset = first.offsetTop - top0;
    const maxOffset = last.offsetTop + last.offsetHeight - (top0 + height);
    const raw = drag.lastY - drag.startY + (window.scrollY - drag.startScroll);
    const offset = Math.max(minOffset, Math.min(maxOffset, raw));
    drag.offset = offset;
    item.style.transform = `translate3d(0, ${offset}px, 0) scale(1.02)`;

    const center = top0 + height / 2 + offset;
    const mid = (el) => el.offsetTop + el.offsetHeight / 2;
    let to = from;
    // (>= / <= so that dragging all the way to either end always reaches the end slot)
    for (let i = from + 1; i < items.length; i++) if (center >= mid(items[i])) to = i;
    if (to === from) for (let i = from - 1; i >= 0; i--) if (center <= mid(items[i])) to = i;
    drag.to = to;

    const shift = height + gapOf();
    items.forEach((el, i) => {
      if (el === item) return;
      let y = 0;
      if (from < to && i > from && i <= to) y = -shift;
      else if (to < from && i >= to && i < from) y = shift;
      el.style.transform = y ? `translate3d(0, ${y}px, 0)` : '';
    });
  }

  /** Scroll the page when dragging near the top or bottom edge. */
  function autoScroll() {
    if (!drag) return;
    const zone = 90;
    const topEdge = zone;
    const bottomEdge = window.innerHeight - zone - 70; // stay clear of the tab bar
    let speed = 0;
    if (drag.lastY < topEdge) speed = -Math.ceil((topEdge - drag.lastY) / 6);
    else if (drag.lastY > bottomEdge) speed = Math.ceil((drag.lastY - bottomEdge) / 6);
    if (speed) {
      const before = window.scrollY;
      window.scrollBy(0, Math.max(-16, Math.min(16, speed)));
      if (window.scrollY !== before) layout();
    }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function onPointerEnd(event) {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    const { handle, item, items, from, to } = drag;
    cancelAnimationFrame(drag.raf);
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerEnd);
    handle.removeEventListener('pointercancel', onPointerEnd);
    handle.removeEventListener('lostpointercapture', onPointerEnd);
    try { handle.releasePointerCapture(drag.pointerId); } catch { /* already released */ }
    drag = null;

    // Settle: move the card in the DOM, then animate everything from where it
    // appears now to its final slot.
    const visualTop = new Map(items.map((el) => [el, el.getBoundingClientRect().top]));
    items.forEach((el) => { el.style.transition = 'none'; el.style.transform = ''; });
    if (to !== from) list.insertBefore(item, to > from ? items[to].nextSibling : items[to]);

    items.forEach((el) => {
      const delta = visualTop.get(el) - el.getBoundingClientRect().top;
      if (delta) el.style.transform = `translate3d(0, ${delta}px, 0)${el === item ? ' scale(1.02)' : ''}`;
    });
    void list.offsetHeight;
    items.forEach((el) => {
      el.style.transition = `transform 260ms ${EASE}`;
      el.style.transform = '';
    });
    setTimeout(() => {
      items.forEach((el) => { el.style.transition = ''; });
      item.classList.remove('is-dragging');
      list.classList.remove('is-drag-active');
    }, 280);

    if (to !== from) onReorder?.([...list.children].map((el) => el.dataset.id), item);
  }

  list.addEventListener('pointerdown', onPointerDown);
  return { isDragging: () => drag !== null };
}
