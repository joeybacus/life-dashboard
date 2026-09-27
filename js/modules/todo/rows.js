/* One task as a row — shared by the To Do screen, its pages and the dashboard
   card. Tapping the row opens its quick menu; the round button ticks it. Priority
   is a coloured dot and a word, never colour alone, and VoiceOver reads the whole
   row ("High priority. Finish neurology report. Today, 8:00 PM to 9:00 PM…"). */
import { html, raw } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { formatStamp, todayKey } from '../../core/manila.js';
import { PRIORITIES, categoryStyle, isDone, isOverdue, overdueText, spokenRow, timeCell } from './model.js';

export function priorityChip(priority) {
  const info = PRIORITIES[priority] ?? PRIORITIES.none;
  return html`<span class="pri pri--${priority in PRIORITIES ? priority : 'none'}"><span class="pri__dot" aria-hidden="true"></span><span class="pri__txt">${info.short}</span></span>`;
}

export function categoryChip(category) {
  if (!category) return '';
  const style = categoryStyle(category);
  return html`<span class="cat-chip" style="--cat: ${style.color}">${icon(style.icon)}<span>${category.name}</span></span>`;
}

/** The round tick button (ticks and unticks; the row itself opens the task). */
export function checkButton(t) {
  const done = isDone(t);
  return html`<button type="button" class="tcheck" role="checkbox" aria-checked="${done ? 'true' : 'false'}" data-action="todo:toggle" data-id="${t.id}"
    aria-label="${done ? 'Done' : 'Not done'}: ${t.title}"><span class="tcheck__box" aria-hidden="true">${icon('check')}</span></button>`;
}

/**
 * The line under a task's name. On iPhone it also carries the priority and the
 * time (the table on iPad landscape and Mac has columns for them).
 */
function metaLine(t, m, cell) {
  const today = todayKey(m.now);
  const category = m.categories.get(t.categoryId);
  const progress = m.progress.get(t.id);
  const overdue = isOverdue(t, m.now);
  const when = [overdue ? 'Overdue' : '', cell.main, cell.sub].filter(Boolean).join(' · ');
  const bits = [];
  if (t.priority !== 'none') bits.push(html`<span class="for-phone">${priorityChip(t.priority)}</span>`);
  bits.push(html`<span class="for-phone tmeta tmeta--when${overdue ? ' is-overdue' : ''}">${when}</span>`);
  if (overdue) bits.push(html`<span class="for-wide tag tag--overdue">${overdueText(t, today)}</span>`);
  if (category) bits.push(categoryChip(category));
  if (progress) bits.push(html`<span class="tmeta" title="Subtasks">${icon('list')}${progress.done}/${progress.total}</span>`);
  if (t.pinned) bits.push(html`<span class="tmeta tmeta--icon" title="Pinned">${icon('pushpin')}</span>`);
  if (t.links?.length) bits.push(html`<span class="tmeta tmeta--icon" title="Links">${icon('paperclip')}</span>`);
  if (t.tags?.length) bits.push(html`<span class="tmeta tmeta--tags">${t.tags.map((tag) => `@${tag}`).join(' ')}</span>`);
  if (isDone(t) && t.completedAt) bits.push(html`<span class="tmeta">Done ${formatStamp(t.completedAt, m.now)}</span>`);
  return html`<span class="trow__meta">${bits}</span>`;
}

export function taskRow(t, m, { manual = false, index = 0, count = 1 } = {}) {
  const cell = timeCell(t, todayKey(m.now));
  const cls = ['trow', `trow--${t.priority}`, isDone(t) && 'is-done', isOverdue(t, m.now) && 'is-overdue', t.pinned && 'is-pinned'].filter(Boolean).join(' ');
  const spoken = spokenRow(t, { category: m.categories.get(t.categoryId), subtasks: m.progress.get(t.id), now: m.now });
  return html`<li class="${cls}" data-id="${t.id}">
    ${manual ? html`<span class="trow__handle" data-drag-handle title="Drag to reorder" aria-hidden="true">${icon('grip')}</span>` : ''}
    <button type="button" class="trow__main" data-action="todo:quick" data-id="${t.id}" aria-label="${spoken} Opens the quick menu.">
      <span class="trow__pri">${priorityChip(t.priority)}</span>
      <span class="trow__body"><span class="trow__title">${t.title || 'Untitled task'}</span>${metaLine(t, m, cell)}</span>
      <span class="trow__time"><span>${cell.main}</span>${cell.sub ? html`<small>${cell.sub}</small>` : ''}</span>
    </button>
    ${checkButton(t)}
    ${manual ? html`<span class="trow__moves">
      <button type="button" class="sr-only sr-only-focusable" data-action="todo:move" data-id="${t.id}" data-dir="-1"${raw(index === 0 ? ' disabled' : '')}>Move ${t.title} up</button>
      <button type="button" class="sr-only sr-only-focusable" data-action="todo:move" data-id="${t.id}" data-dir="1"${raw(index === count - 1 ? ' disabled' : '')}>Move ${t.title} down</button>
    </span>` : ''}
  </li>`;
}

