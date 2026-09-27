/* One task in a sheet: add a new task, or see and change everything about an
   existing one — title, priority, date and time, category, tags, pin, notes,
   subtasks and links. Changes to an existing task save as you make them (text
   a moment after you stop typing); a new task is saved when you tap Add. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { state } from '../../core/state.js';
import { db } from '../../core/db.js';
import { uid } from '../../core/ids.js';
import { actionSheet, announce, confirmDialog, openDialog, toast } from '../../core/ui.js';
import { makeReorderable } from '../../core/reorder.js';
import { prefersReducedMotion } from '../../core/platform.js';
import { addDays, daysFrom, formatDayLong, formatStamp, todayKey } from '../../core/manila.js';
import {
  MAX_NOTES, MAX_TITLE, PRIORITIES, PRIORITY_KEYS, categoryStyle, cleanUrl, isDone, linkTitle, newTask, normalizeTask, parseTags,
} from './model.js';
import {
  addSubtask, createTask, deleteSub, loadTodo, moveToTomorrow, putBack, reorderSubs, saveSub, saveTask, setDone, softDelete, subtaskToTask,
} from './store.js';

const checkedAttr = (on) => (on ? raw(' checked') : '');
const disabledAttr = (on) => (on ? raw(' disabled') : '');

/** A task's content, to tell whether anything changed (timestamps don't count). */
const contentKey = ({ updatedAt, createdAt, ...rest }) => JSON.stringify(rest);

/** Open a task by id. */
export async function openTask(id) {
  const [record, data] = await Promise.all([db.get('tasks', id), loadTodo()]);
  if (!record || record.deletedAt) {
    toast('This task was deleted.', { icon: 'info' });
    return;
  }
  await taskSheet({ task: normalizeTask(record), data, isNew: false });
}

/** Add a task. fields: starting values (e.g. { date } from the view you're in). */
export async function openNewTask(fields = {}) {
  const data = await loadTodo();
  const s = state.settings.tasks;
  const task = newTask({
    priority: PRIORITIES[s.defaultPriority] ? s.defaultPriority : 'none',
    categoryId: data.categories.has(s.defaultCategoryId) ? s.defaultCategoryId : null,
    ...fields,
  });
  await taskSheet({ task, data, isNew: true });
}

/* ---------- The sheet ---------- */

function categoryOptions(categories, selectedId) {
  const list = [...categories.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return html`<option value=""${raw(selectedId ? '' : ' selected')}>No category</option>
    ${list.map((c) => html`<option value="${c.id}"${raw(c.id === selectedId ? ' selected' : '')}>${c.name}</option>`)}`;
}

function dateHint(task, today) {
  if (!task.date) return 'No date — it shows in All and By category, not in Today.';
  const near = { 0: 'Today', 1: 'Tomorrow', [-1]: 'Yesterday' }[daysFrom(today, task.date)];
  return near ? `${near} · ${formatDayLong(task.date)}` : formatDayLong(task.date);
}

function sheetBody(task, { isNew, categories, today }) {
  const quick = (key, label, date) => html`<button type="button" class="tform__quick" data-date="${key}" aria-pressed="${task.date === date ? 'true' : 'false'}">${label}</button>`;
  return html`<form class="tform" data-tform novalidate>
    ${task.sample ? html`<p class="note tform__sample">${icon('sampleData')}<span>A sample task: try anything. Changes stay on this device and sample tasks are reset each day.</span></p>` : ''}
    <label class="tform__title-field"><span class="sr-only">Task</span>
      <textarea class="input tform__title" name="title" rows="2" maxlength="${MAX_TITLE}" placeholder="What needs doing?" enterkeyhint="done" autocapitalize="sentences" required>${task.title}</textarea>
    </label>

    <fieldset class="tform__field">
      <legend class="field__label">Priority</legend>
      <div class="segmented tform__pri">
        ${PRIORITY_KEYS.map((p) => html`<label class="segmented__opt"><input type="radio" name="priority" value="${p}"${checkedAttr(task.priority === p)}><span><i class="pri pri--${p}" aria-hidden="true"><i class="pri__dot"></i></i>${PRIORITIES[p].label}</span></label>`)}
      </div>
    </fieldset>

    <div class="tform__field" role="group" aria-labelledby="tf-date-label">
      <span class="field__label" id="tf-date-label">Date</span>
      <div class="tform__dates" data-slot="dates">
        ${quick('today', 'Today', today)}
        ${quick('tomorrow', 'Tomorrow', addDays(today, 1))}
        <input type="date" class="input tform__date" name="date" value="${task.date ?? ''}" aria-label="Pick a date">
        ${task.date ? html`<button type="button" class="tform__quick" data-date="none">No date</button>` : ''}
      </div>
      <p class="tform__hint" data-slot="dateHint">${dateHint(task, today)}</p>
    </div>

    <div class="tform__field" role="group" aria-labelledby="tf-time-label">
      <span class="field__label" id="tf-time-label">Time</span>
      <div class="tform__times">
        <input type="time" class="input" name="startTime" value="${task.startTime ?? ''}" aria-label="Start time"${disabledAttr(!task.date)}>
        <span class="tform__to" aria-hidden="true">to</span>
        <input type="time" class="input" name="endTime" value="${task.endTime ?? ''}" aria-label="End time (optional)"${disabledAttr(!task.date || !task.startTime)}>
        <button type="button" class="tform__quick" data-clear-time${disabledAttr(!task.startTime)}>No time</button>
      </div>
      <p class="tform__hint">${task.date ? 'Optional. Tasks without a time are fine.' : 'Pick a date to add a time.'}</p>
    </div>

    <label class="tform__field"><span class="field__label">Category</span>
      <select class="select" name="categoryId">${categoryOptions(categories, task.categoryId)}</select>
    </label>

    <label class="tform__field"><span class="field__label">Tags</span>
      <input class="input" name="tags" value="${task.tags.join(', ')}" placeholder="For example: school, paper" autocapitalize="none" autocomplete="off" spellcheck="false" enterkeyhint="done">
    </label>

    <label class="row tform__pin">
      <span class="row__text"><span class="row__label">${icon('pushpin')}Pin</span><span class="row__sub">Keeps it at the top and always in Today</span></span>
      <input type="checkbox" class="switch" switch name="pinned"${checkedAttr(task.pinned)}>
    </label>

    <label class="tform__field"><span class="field__label">Notes</span>
      <textarea class="input textarea" name="notes" rows="3" maxlength="${MAX_NOTES}" placeholder="Optional">${task.notes}</textarea>
    </label>

    <section class="tform__section" aria-labelledby="tf-subs-title">
      <div class="tform__section-head"><h3 class="tform__section-title" id="tf-subs-title">Subtasks</h3><span class="tform__section-meta" data-slot="subCount"></span></div>
      <div data-slot="subs"></div>
      <div class="subs-add">
        <input class="input" data-sub-new placeholder="Add a subtask" maxlength="${MAX_TITLE}" enterkeyhint="done" autocapitalize="sentences" aria-label="New subtask">
        <button type="button" class="btn btn--sm" data-sub-add>${icon('plus')}Add</button>
      </div>
    </section>

    <section class="tform__section" aria-labelledby="tf-links-title">
      <div class="tform__section-head"><h3 class="tform__section-title" id="tf-links-title">Links</h3><span class="tform__section-meta">A Google Drive file, a web page…</span></div>
      <div data-slot="links"></div>
      <button type="button" class="btn btn--sm btn--ghost tform__add-link" data-link-add>${icon('link')}Add link</button>
    </section>

    ${isNew ? '' : html`<div class="tform__actions">
      <button type="button" class="btn" data-complete>${icon(isDone(task) ? 'refresh' : 'checkCircle')}${isDone(task) ? 'Mark not done' : 'Complete'}</button>
      <button type="button" class="btn" data-tomorrow>${icon('arrowRight')}Move to tomorrow</button>
      <button type="button" class="btn btn--danger" data-delete>${icon('trash')}Delete</button>
    </div>
    <p class="tform__meta" data-slot="meta"></p>`}

    <div class="tform__footer">
      ${isNew
        ? html`<button type="button" class="btn btn--ghost" data-cancel>Cancel</button><button type="submit" class="btn btn--primary" data-add>${icon('plus')}Add task</button>`
        : html`<button type="submit" class="btn btn--primary" data-done>Done</button>`}
    </div>
  </form>`;
}

function metaText(task) {
  const parts = [];
  if (task.createdAt) parts.push(`Added ${formatStamp(task.createdAt)}`);
  if (isDone(task) && task.completedAt) parts.push(`Completed ${formatStamp(task.completedAt)}`);
  if (task.updatedAt && task.updatedAt !== task.createdAt) parts.push(`Changed ${formatStamp(task.updatedAt)}`);
  return parts.join(' · ');
}

function subRow(sub, i, count) {
  return html`<li class="sub${sub.done ? ' is-done' : ''}" data-id="${sub.id}">
    <span class="sub__handle" data-drag-handle title="Drag to reorder" aria-hidden="true">${icon('grip')}</span>
    <label class="sub__check"><input type="checkbox" data-sub-done${checkedAttr(sub.done)} aria-label="Done: ${sub.title}"><span class="sub__box" aria-hidden="true">${icon('check')}</span></label>
    <input class="sub__title" value="${sub.title}" maxlength="${MAX_TITLE}" data-sub-title aria-label="Subtask ${i + 1} of ${count}" enterkeyhint="done">
    <button type="button" class="icon-btn icon-btn--sm" data-sub-menu aria-label="Options for ${sub.title}">${icon('more')}</button>
    <button type="button" class="sr-only sr-only-focusable" data-sub-move="-1"${disabledAttr(i === 0)}>Move ${sub.title} up</button>
    <button type="button" class="sr-only sr-only-focusable" data-sub-move="1"${disabledAttr(i === count - 1)}>Move ${sub.title} down</button>
  </li>`;
}

function linkRow(link) {
  return html`<li class="tlink" data-id="${link.id}">
    <a class="tlink__open" href="${link.url}" target="_blank" rel="noopener noreferrer">${icon('link')}<span class="tlink__text"><span class="tlink__title">${link.title || linkTitle(link.url)}</span><span class="tlink__url">${linkTitle(link.url)}</span></span>${icon('external', 'tlink__ext')}</a>
    <button type="button" class="icon-btn icon-btn--sm" data-link-menu aria-label="Options for the link ${link.title || linkTitle(link.url)}">${icon('more')}</button>
  </li>`;
}

async function askForLink(existing = null) {
  const result = await openDialog({
    variant: 'alert',
    className: 'prompt-dialog',
    title: existing ? 'Edit link' : 'Add a link',
    body: html`<form class="prompt" data-link-form novalidate>
      <label class="field"><span class="field__label">Web address</span>
        <input class="input" name="url" type="url" inputmode="url" value="${existing?.url ?? ''}" placeholder="https://drive.google.com/…" autocapitalize="none" autocomplete="off" spellcheck="false" required></label>
      <label class="field"><span class="field__label">Name (optional)</span>
        <input class="input" name="title" value="${existing?.title ?? ''}" maxlength="120" placeholder="For example: Case brief"></label>
      <p class="form-error" data-link-error hidden>That doesn’t look like a web address.</p>
      <div class="dlg__actions">
        <button type="button" class="btn btn--ghost" data-dialog-value="__cancel">Cancel</button>
        <button type="submit" class="btn btn--primary">${existing ? 'Save' : 'Add'}</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-link-form]');
      setTimeout(() => form.elements.url.focus(), 60);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const url = cleanUrl(form.elements.url.value);
        if (!url) {
          dlg.querySelector('[data-link-error]').hidden = false;
          form.elements.url.focus();
          return;
        }
        close({ url, title: form.elements.title.value.trim().slice(0, 120) });
      });
    },
  });
  return result && typeof result === 'object' ? result : null;
}

async function taskSheet({ task: start, data, isNew }) {
  let draft = { ...start };
  let subs = isNew ? [] : data.subtasks.filter((s) => s.taskId === start.id);
  let lastSaved = contentKey(start);
  let typingTimer = null;
  let saving = Promise.resolve();
  let adding = false;
  let finished = false; // deleted, or put back by Undo: nothing more to save from this sheet
  let form = null;
  let closeSheet = null;
  const pendingTitles = new Map(); // subtask id → title being typed
  let titlesTimer = null;
  const today = todayKey();

  /** Keep what another action just saved (Complete, Move to tomorrow) as the sheet's latest. */
  const adopt = (saved) => {
    draft = { ...draft, ...saved };
    lastSaved = contentKey(draft);
  };

  /** Save the task if anything changed since the last save. */
  const persist = () => {
    clearTimeout(typingTimer);
    typingTimer = null;
    if (isNew || finished || !draft.title.trim() || contentKey(draft) === lastSaved) return saving;
    const snapshot = { ...draft };
    lastSaved = contentKey(snapshot);
    saving = saving.then(() => saveTask(snapshot, { quiet: true })).then((saved) => {
      draft = { ...draft, updatedAt: saved.updatedAt, createdAt: saved.createdAt };
      const meta = form?.querySelector('[data-slot="meta"]');
      if (meta) meta.textContent = metaText(draft);
    }).catch((err) => {
      console.error(err);
      lastSaved = null;
      toast('Couldn’t save that change. Please try again.', { icon: 'info' });
    });
    return saving;
  };
  const persistSoon = () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(persist, 500);
  };

  /** Save subtask names being typed. */
  const flushTitles = async () => {
    clearTimeout(titlesTimer);
    titlesTimer = null;
    const pending = [...pendingTitles];
    pendingTitles.clear();
    for (const [id, title] of pending) {
      const sub = subs.find((s) => s.id === id);
      if (!sub || sub.title === title) continue;
      sub.title = title;
      if (!isNew) await saveSub(sub);
    }
  };

  const refreshSubs = async () => {
    await flushTitles();
    if (!isNew) subs = (await db.all('subtasks')).filter((s) => s.taskId === draft.id && !s.deletedAt).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const slot = form?.querySelector('[data-slot="subs"]');
    if (!slot) return;
    const done = subs.filter((s) => s.done).length;
    form.querySelector('[data-slot="subCount"]').textContent = subs.length ? `${done} of ${subs.length} done` : '';
    setHTML(slot, subs.length ? html`
      <div class="progress" role="progressbar" aria-label="Subtasks done" aria-valuemin="0" aria-valuemax="${subs.length}" aria-valuenow="${done}"><span style="width: ${Math.round((done / subs.length) * 100)}%"></span></div>
      <ol class="subs" data-subs>${subs.map((s, i) => subRow(s, i, subs.length))}</ol>` : '');
    const list = slot.querySelector('[data-subs]');
    if (list) {
      makeReorderable(list, {
        onReorder: async (ids, item) => {
          await reorderSubsTo(ids);
          announce(`Moved to position ${ids.indexOf(item.dataset.id) + 1} of ${ids.length}.`);
        },
      });
    }
  };

  const reorderSubsTo = async (ids) => {
    if (isNew) subs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    else await reorderSubs(subs, ids);
    await refreshSubs();
  };

  const refreshLinks = () => {
    const slot = form?.querySelector('[data-slot="links"]');
    if (slot) setHTML(slot, draft.links.length ? html`<ul class="tlinks">${draft.links.map(linkRow)}</ul>` : '');
  };

  const refreshDates = () => {
    const quickDates = { today, tomorrow: addDays(today, 1) };
    form.querySelectorAll('[data-date]').forEach((b) => {
      if (b.dataset.date in quickDates) b.setAttribute('aria-pressed', String(draft.date === quickDates[b.dataset.date]));
    });
    const noDate = form.querySelector('[data-date="none"]');
    if (draft.date && !noDate) form.elements.date.insertAdjacentHTML('afterend', '<button type="button" class="tform__quick" data-date="none">No date</button>');
    if (!draft.date && noDate) noDate.remove();
    form.elements.date.value = draft.date ?? '';
    form.querySelector('[data-slot="dateHint"]').textContent = dateHint(draft, today);
    if (!draft.date) {
      draft.startTime = null;
      draft.endTime = null;
    }
    refreshTimes();
  };

  const refreshTimes = () => {
    const { startTime, endTime } = form.elements;
    startTime.disabled = !draft.date;
    endTime.disabled = !draft.date || !draft.startTime;
    startTime.value = draft.startTime ?? '';
    endTime.value = draft.endTime ?? '';
    form.querySelector('[data-clear-time]').disabled = !draft.startTime;
    startTime.closest('.tform__field').querySelector('.tform__hint').textContent = draft.date ? 'Optional. Tasks without a time are fine.' : 'Pick a date to add a time.';
  };

  /** Ticking the last subtask offers to complete the task too (never automatically). */
  const offerComplete = async () => {
    if (isNew || isDone(draft) || !subs.length || subs.some((s) => !s.done)) return;
    const yes = await confirmDialog({ title: 'All subtasks are done', message: `Mark “${draft.title}” as done too?`, confirmLabel: 'Complete task', cancelLabel: 'Not yet' });
    if (!yes) return;
    await persist();
    const before = { ...draft };
    adopt(await setDone(draft, true));
    closeSheet?.('completed');
    toast(`Done: ${draft.title}`, { icon: 'checkCircle', action: { label: 'Undo', onClick: () => putBack(before) } });
  };

  const onInput = (event) => {
    const t = event.target;
    if (t.name === 'title') {
      draft.title = t.value.replace(/\s*\n+\s*/g, ' ');
      if (!isNew && draft.title.trim()) persistSoon();
    } else if (t.name === 'notes') {
      draft.notes = t.value;
      persistSoon();
    } else if (t.name === 'tags') {
      draft.tags = parseTags(t.value);
      persistSoon();
    } else if (t.matches('[data-sub-title]')) {
      if (!t.value.trim()) return;
      pendingTitles.set(t.closest('[data-id]').dataset.id, t.value.trim().slice(0, MAX_TITLE));
      clearTimeout(titlesTimer);
      titlesTimer = setTimeout(flushTitles, 500);
    }
  };

  const onChange = async (event) => {
    const t = event.target;
    if (t.name === 'priority') {
      draft.priority = t.value;
    } else if (t.name === 'date') {
      draft.date = t.value || null;
      refreshDates();
    } else if (t.name === 'startTime') {
      draft.startTime = t.value || null;
      if (!draft.startTime) draft.endTime = null;
      refreshTimes();
    } else if (t.name === 'endTime') {
      draft.endTime = t.value || null;
    } else if (t.name === 'categoryId') {
      draft.categoryId = t.value || null;
    } else if (t.name === 'pinned') {
      draft.pinned = t.checked;
    } else if (t.name === 'tags') {
      t.value = draft.tags.join(', ');
      return;
    } else if (t.matches('[data-sub-done]')) {
      const sub = subs.find((s) => s.id === t.closest('[data-id]').dataset.id);
      if (!sub) return;
      sub.done = t.checked;
      if (!isNew) await saveSub(sub);
      await refreshSubs();
      form.querySelector(`[data-id="${sub.id}"] [data-sub-done]`)?.focus(); // keep your place (keyboard, VoiceOver)
      await offerComplete();
      return;
    } else if (t.matches('[data-sub-title]')) {
      if (!t.value.trim()) t.value = subs.find((s) => s.id === t.closest('[data-id]').dataset.id)?.title ?? '';
      return;
    } else {
      return;
    }
    if (!isNew) persist();
  };

  const addSub = async () => {
    const input = form.querySelector('[data-sub-new]');
    const title = input.value.trim();
    if (!title) {
      input.focus();
      return;
    }
    input.value = '';
    if (isNew) subs.push({ id: uid(), title, done: false, order: subs.length });
    else await addSubtask(draft.id, title, subs.length ? Math.max(...subs.map((s) => s.order ?? 0)) + 1 : 0);
    await refreshSubs();
    input.focus();
    announce(`Subtask added: ${title}`);
  };

  const onClick = async (event) => {
    const t = event.target.closest('button');
    if (!t) return;
    if (t.dataset.date) {
      draft.date = { today, tomorrow: addDays(today, 1), none: null }[t.dataset.date];
      refreshDates();
      if (!isNew) persist();
    } else if ('clearTime' in t.dataset) {
      draft.startTime = null;
      draft.endTime = null;
      refreshTimes();
      if (!isNew) persist();
    } else if ('subAdd' in t.dataset) {
      await addSub();
    } else if (t.dataset.subMove) {
      const id = t.closest('[data-id]').dataset.id;
      const ids = subs.map((s) => s.id);
      const from = ids.indexOf(id);
      const to = from + Number(t.dataset.subMove);
      if (to < 0 || to >= ids.length) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      await reorderSubsTo(ids);
      form.querySelector(`[data-id="${id}"] [data-sub-move="${t.dataset.subMove}"]`)?.focus();
      announce(`Moved to position ${to + 1} of ${ids.length}.`);
    } else if ('subMenu' in t.dataset) {
      await subMenu(t.closest('[data-id]').dataset.id);
    } else if ('linkAdd' in t.dataset) {
      const link = await askForLink();
      if (!link) return;
      draft.links = [...draft.links, { id: uid(), title: link.title, url: link.url }];
      refreshLinks();
      if (!isNew) persist();
    } else if ('linkMenu' in t.dataset) {
      await linkMenu(t.closest('[data-id]').dataset.id);
    } else if ('complete' in t.dataset) {
      await persist();
      const before = { ...draft };
      adopt(await setDone(draft, !isDone(draft)));
      if (isDone(draft)) {
        closeSheet('completed');
        toast(`Done: ${draft.title}`, { icon: 'checkCircle', action: { label: 'Undo', onClick: () => putBack(before) } });
      } else {
        t.innerHTML = `${icon('checkCircle')}Complete`;
        announce(`${draft.title} is not done.`);
      }
    } else if ('tomorrow' in t.dataset) {
      await persist();
      const before = { ...draft };
      adopt(await moveToTomorrow(draft));
      refreshDates();
      toast('Moved to tomorrow.', {
        icon: 'arrowRight',
        action: {
          label: 'Undo',
          onClick: async () => {
            finished = true;
            await putBack(before);
            closeSheet?.('undo');
          },
        },
      });
    } else if ('delete' in t.dataset) {
      const ok = await confirmDialog({ title: 'Delete this task?', message: `“${draft.title}” goes to Recently deleted, where you can restore it for 30 days.`, confirmLabel: 'Delete', destructive: true });
      if (!ok) return;
      await persist();
      const before = { ...draft };
      finished = true;
      await softDelete(draft);
      closeSheet('deleted');
      toast(`Deleted: ${draft.title}`, { icon: 'trash', action: { label: 'Undo', onClick: () => putBack(before) } });
    } else if ('cancel' in t.dataset) {
      await tryClose();
    }
  };

  const subMenu = async (id) => {
    const sub = subs.find((s) => s.id === id);
    if (!sub) return;
    const choice = await actionSheet({
      title: sub.title,
      items: [
        !isNew && { label: 'Turn into a task', value: 'convert', icon: 'plusCircle' },
        { label: 'Delete subtask', value: 'delete', icon: 'trash', destructive: true },
      ],
    });
    if (choice === 'convert') {
      const task = await subtaskToTask(sub, draft);
      await refreshSubs();
      toast(`“${task.title}” is now a task.`, { icon: 'checklist' });
    } else if (choice === 'delete') {
      if (isNew) subs = subs.filter((s) => s.id !== id);
      else await deleteSub(sub);
      await refreshSubs();
      if (!isNew) toast('Subtask deleted.', { icon: 'trash', action: { label: 'Undo', onClick: async () => { await saveSub({ ...sub, deletedAt: null }); await refreshSubs(); } } });
    }
  };

  const linkMenu = async (id) => {
    const link = draft.links.find((l) => l.id === id);
    if (!link) return;
    const choice = await actionSheet({
      title: link.title || linkTitle(link.url),
      message: link.url,
      items: [
        { label: 'Edit or rename', value: 'edit', icon: 'edit' },
        { label: 'Remove link', value: 'remove', icon: 'trash', destructive: true },
      ],
    });
    if (choice === 'edit') {
      const changed = await askForLink(link);
      if (!changed) return;
      draft.links = draft.links.map((l) => (l.id === id ? { ...l, ...changed } : l));
    } else if (choice === 'remove') {
      const before = draft.links;
      draft.links = draft.links.filter((l) => l.id !== id);
      if (!isNew) {
        toast('Link removed.', { icon: 'link', action: { label: 'Undo', onClick: () => { draft.links = before; refreshLinks(); persist(); } } });
      }
    } else {
      return;
    }
    refreshLinks();
    if (!isNew) persist();
  };

  /** Add the new task (one task per tap, however fast you tap). */
  const add = async () => {
    if (adding) return;
    const title = draft.title.trim();
    if (!title) {
      form.elements.title.focus();
      toast('Give the task a name first.', { icon: 'info' });
      return;
    }
    adding = true;
    form.querySelector('[data-add]').disabled = true;
    try {
      const created = await createTask({ ...draft, title }, { subtasks: subs });
      closeSheet('added');
      toast(`Added: ${created.title}`, { icon: 'checklist', action: { label: 'Undo', onClick: () => softDelete(created) } });
      announce(`Task added: ${created.title}`);
    } catch (err) {
      console.error(err);
      adding = false;
      form.querySelector('[data-add]').disabled = false;
      toast('Couldn’t add the task. Please try again.', { icon: 'info' });
    }
  };

  const tryClose = async () => {
    if (isNew && (draft.title.trim() || subs.length || draft.links.length)) {
      const discard = await confirmDialog({ title: 'Discard this task?', message: 'It hasn’t been added yet.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true });
      if (!discard) return;
    }
    closeSheet(null);
  };

  await openDialog({
    variant: 'sheet',
    className: 'task-sheet accent-todo',
    dismissible: false,
    title: isNew ? 'New task' : (draft.sample ? 'Sample task' : 'Task'),
    body: sheetBody(draft, { isNew, categories: data.categories, today }),
    onOpen(dlg, close) {
      closeSheet = close;
      form = dlg.querySelector('[data-tform]');
      refreshSubs();
      refreshLinks();
      if (!isNew) form.querySelector('[data-slot="meta"]').textContent = metaText(draft);
      form.addEventListener('input', onInput);
      form.addEventListener('change', onChange);
      form.addEventListener('click', onClick);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isNew) await add();
        else {
          await persist();
          close('done');
        }
      });
      form.addEventListener('keydown', async (event) => {
        const t = event.target;
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          form.requestSubmit();
        } else if (event.key === 'Enter' && t.name === 'title') {
          event.preventDefault(); // a task name is one line
          if (isNew) form.requestSubmit();
          else t.blur();
        } else if (event.key === 'Enter' && t.matches('[data-sub-new]')) {
          event.preventDefault();
          await addSub();
        } else if (event.key === 'Enter' && (t.matches('[data-sub-title]') || t.name === 'tags')) {
          event.preventDefault();
          t.blur();
        }
      });
      // Escape (or tapping outside): close — asks first if a new task would be lost
      dlg.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          tryClose();
        }
      });
      dlg.addEventListener('click', (event) => { if (event.target === dlg) tryClose(); });
      // Mac (or iPad with a trackpad): type straight away, once the sheet has finished appearing.
      // Not on iPhone: its keyboard only opens when you tap the field anyway.
      if (isNew && matchMedia('(hover: hover) and (pointer: fine)').matches) {
        setTimeout(() => form.elements.title.focus({ preventScroll: true }), prefersReducedMotion() ? 0 : 320);
      }
    },
  });

  // Closed: save the last typing (an emptied name goes back to what it was)
  await flushTitles();
  if (!isNew) {
    if (!draft.title.trim()) draft.title = start.title;
    await persist();
  }
}
