/* The report windows of a patient list: Report (on the list) writes the daily
   summary of the patients you rounded on, and Referral (on a patient's page)
   one patient's detailed update — text you can edit, then copy or share into
   a message to your consultant. Nothing is sent or saved from here: the text
   stays on this device until you copy or share it.

   Report setup says which column holds each part; it's saved with the list
   (def.report — columns and two lines of text, never patients). The wording
   and what changed are worked out in report.js. */
import { html, raw, setHTML } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { confirmDialog, openDialog, toast } from '../../core/ui.js';
import { updateList, wardList } from './engine.js';
import { colIndex, locationKey, previousDateKey, wardDay } from './model.js';
import {
  MAX_LINE, REPORT_SECTIONS, compareDay, nameParts, patientReport, referralText, reportColumns, reportSetup, summaryText, tidy, windowStart,
} from './report.js';

const canShare = () => typeof navigator.share === 'function';
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The list's report setup, and its columns with their logsheet headings. */
function setupOf(list) {
  const headings = list.cache?.headings ?? [];
  const columns = list.columns().map((c) => ({ ...c, heading: String(headings[colIndex(c.col) - 1] ?? '').trim() }));
  return { setup: reportSetup(list.def.report, columns), columns };
}

/** Patients in the list's order: by location when it's arranged that way, else the logsheet's. */
function reportOrder(v) {
  const byRow = v.patients.filter((p) => String(p.name ?? '').trim()).sort((a, b) => a.row - b.row);
  if (v.arrange !== 'location') return byRow;
  const rank = new Map(v.locations.map((l, i) => [l.key, i]));
  const at = (p) => (p.location ? rank.get(locationKey(p.location)) ?? 1e9 : 1e9);
  return byRow.sort((a, b) => at(a) - at(b) || a.row - b.row);
}

/* ---------- Report setup ---------- */

/** Choose which column holds each part of a report. Resolves true when saved. */
export async function openReportSetup(listId, { first = false } = {}) {
  const list = wardList(listId);
  if (!list) return false;
  const { setup, columns } = setupOf(list);
  const usable = reportColumns(columns);
  const select = (id) => html`<select class="select" name="${id}">
      <option value="">Not in the report</option>
      ${usable.map((c) => html`<option value="${c.col}"${raw(setup.cols[id] === c.col ? ' selected' : '')}>${c.col} · ${c.label}</option>`)}
    </select>`;
  const result = await openDialog({
    variant: 'sheet',
    className: 'ward-report-setup accent-neuro',
    dismissible: false,
    title: 'Report setup',
    body: html`<form class="form" data-rsetup novalidate>
      <p class="dlg__msg">${first ? 'Before your first report: check ' : 'Check '}which column of “${list.name}” holds each part of a report. Only columns the list shows can be used — add others in Columns.</p>
      ${REPORT_SECTIONS.map((s) => html`<label class="field"><span class="field__label">${s.label}</span>${select(s.id)}</label>`)}
      <p class="ward-edit__hint">Labs whose lines start with a date (like “2026-10-16 Na 135”) count by that date. Everything else counts as new when it wasn’t in the box at the end of the day before.</p>
      <label class="field"><span class="field__label">Referral — first line</span>
        <input class="input" name="open" maxlength="${MAX_LINE}" value="${setup.open}" autocapitalize="sentences" autocomplete="off"></label>
      <label class="field"><span class="field__label">Referral — last line</span>
        <input class="input" name="close" maxlength="${MAX_LINE}" value="${setup.close}" autocapitalize="sentences" autocomplete="off"></label>
      <p class="ward-edit__hint">Saved with the list, so your other devices use it too — only these choices, never patients.</p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn--primary">${first ? 'Save and continue' : 'Save'}</button>
      </div>
    </form>`,
    onOpen(dlg, close) {
      const form = dlg.querySelector('[data-rsetup]');
      const values = () => ({
        cols: Object.fromEntries(REPORT_SECTIONS.map(({ id }) => [id, form.elements[id].value])),
        open: form.elements.open.value.replace(/\s+/g, ' ').trim(),
        close: form.elements.close.value.replace(/\s+/g, ' ').trim(),
      });
      const start = JSON.stringify(values());
      form.querySelector('[data-cancel]').addEventListener('click', async () => {
        if (JSON.stringify(values()) !== start && !(await confirmDialog({ title: 'Discard these changes?', message: 'The report setup stays as it was.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true }))) return;
        close(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        close(values());
      });
    },
  });
  if (!result || typeof result !== 'object') return false;
  await updateList(listId, (def) => { def.report = result; });
  // (Inside a report the window shows the new setup instead: a toast would be hidden behind it)
  if (!first && !document.querySelector('dialog[open]')) toast('Report setup saved.', { icon: 'check' });
  return true;
}

/* ---------- The report windows ---------- */

/** The daily summary of the patients you rounded on today. */
export const openReport = (listId) => reportWindow(listId, null);
/** One patient's detailed referral. */
export const openReferral = (listId, patientId) => reportWindow(listId, patientId);

async function reportWindow(listId, patientId) {
  const list = wardList(listId);
  if (!list) return;
  if (!setupOf(list).setup.saved && !(await openReportSetup(listId, { first: true }))) return;
  const single = patientId != null;
  // chosen: patient ids in the summary; whoOpen: the Patients box open (null: open only when no one is chosen)
  const state = { days: 1, chosen: null, earlier: new Map(), whoOpen: null };
  let last = null;     // the latest build
  let generated = '';  // the text as built (before you type in it)
  let copied = null;   // the text last copied or shared
  let parts = null;    // the window's elements
  let sayTimer = null;

  const build = () => {
    const now = wardList(listId);
    if (!now) return null;
    const v = now.view();
    const { setup } = setupOf(now);
    const opts = { seen: now.seen, today: v.date, days: state.days };
    if (single) {
      const p = v.patients.find((x) => x.id === patientId);
      if (!p) return { v, seen: now.seen, gone: true, reports: [], text: '' };
      const r = patientReport(p, setup, opts);
      return { v, seen: now.seen, reports: [r], text: referralText(r, setup, { days: state.days, earlier: state.earlier.get(r.id) ?? null }) };
    }
    const order = reportOrder(v);
    if (!state.chosen) state.chosen = new Set(order.filter((p) => v.hidden.rounded || p.rounded).map((p) => p.id));
    const reports = order.filter((p) => state.chosen.has(p.id)).map((p) => patientReport(p, setup, opts));
    return { v, seen: now.seen, order, reports, text: summaryText(reports, { days: state.days, earlier: state.earlier }) };
  };

  /** Patients whose exam changed, so the earlier one can be shown ("to now"). */
  const canShowEarlier = (r) => r.events?.status === 'changed' && r.events.mid === undefined && Boolean(tidy(r.events.before));
  const earlierOn = (r) => state.earlier.get(r.id) ?? r.events.drastic;

  /** Says what changes are compared with, when it isn't simply the end of yesterday. */
  const compareNote = (b) => {
    const from = windowStart(b.v.date, state.days);
    const ref = compareDay(b.seen, from);
    if (!b.seen?.[ref]) {
      const earliest = Object.keys(b.seen ?? {}).filter((d) => d < b.v.date).sort()[0];
      return html`<p class="rpt__note">${icon('info')}<span>${earliest
        ? `This device has no copy of the list from ${wardDay(ref)} to compare with (its copies start on ${wardDay(earliest)}), so only your edits in the app count`
        : 'From today this device keeps a copy of each box at the end of every day, so from tomorrow it can tell what changed — also in Google Sheets or on another device. Until then only your edits in the app count'}, and a box it can’t compare is copied in full.</span></p>`;
    }
    if (ref !== previousDateKey(from)) {
      return html`<p class="rpt__note">${icon('info')}<span>Changes are compared with what this device saw on ${wardDay(ref)}, the last day the list was opened before ${state.days === 2 ? 'yesterday' : 'today'}.</span></p>`;
    }
    return '';
  };

  const summaryOptions = (b) => {
    const byId = new Map(b.reports.map((r) => [r.id, r]));
    const earlierShown = b.reports.filter((r) => canShowEarlier(r) && earlierOn(r));
    const rounded = b.order.filter((p) => p.rounded).length;
    return html`${compareNote(b)}
      ${b.order.length && !b.reports.length ? html`<p class="rpt__note rpt__note--warn">${icon('info')}<span>${rounded ? 'No one is in the report.' : 'You haven’t ticked anyone as rounded today.'} Choose who goes in under Patients.</span></p>` : ''}
      <details class="rpt__who"${raw((state.whoOpen ?? !b.reports.length) ? ' open' : '')}>
        <summary>${icon('user')}<span>Patients · <strong>${b.reports.length}</strong> of ${b.order.length} in the report</span>${icon('chevronDown')}</summary>
        <div class="rpt__picks">
          <button type="button" class="btn btn--sm" data-rpick="rounded"${raw(rounded ? '' : ' disabled')}>Rounded today (${rounded})</button>
          <button type="button" class="btn btn--sm" data-rpick="all">Everyone</button>
          <button type="button" class="btn btn--sm" data-rpick="none">No one</button>
        </div>
        <ul class="rpt__list">${b.order.map((p) => {
          const r = byId.get(p.id);
          return html`<li class="rpt__row">
            <label class="rpt__pick"><input type="checkbox" data-pick="${p.id}"${raw(r ? ' checked' : '')}>
              <span class="rpt__who-name">${r?.name ?? nameParts(p.name, b.v.date).name}</span>
              <span class="rpt__meta">${[p.location, p.rounded ? 'rounded' : ''].filter(Boolean).join(' · ')}</span></label>
            ${r && canShowEarlier(r) ? html`<label class="rpt__earlier"><input type="checkbox" class="switch" switch data-earlier="${p.id}"${raw(earlierOn(r) ? ' checked' : '')}><span>Earlier exam</span></label>` : ''}
          </li>`;
        })}</ul>
      </details>
      ${earlierShown.length ? html`<p class="rpt__note">${icon('info')}<span>The earlier exam, then “to now”, is shown for ${earlierShown.map((r) => r.name).join(', ')}${earlierShown.some((r) => state.earlier.get(r.id) == null) ? ' — the exam got much worse (for example plegia or decreased sensorium)' : ''}. Turn it off under Patients.</span></p>` : ''}`;
  };

  const referralOptions = (b) => {
    if (b.gone) return html`<p class="rpt__note rpt__note--warn">${icon('info')}<span>This patient is no longer in the logsheet.</span></p>`;
    const r = b.reports[0];
    return html`${compareNote(b)}
      ${canShowEarlier(r) ? html`<label class="rpt__switch"><input type="checkbox" class="switch" switch data-earlier="${r.id}"${raw(earlierOn(r) ? ' checked' : '')}>
        <span>Show the earlier exam, then “to now”${r.events.drastic && state.earlier.get(r.id) == null ? html`<span class="rpt__meta"> — on because the exam got much worse</span>` : ''}</span></label>` : ''}`;
  };

  const drawOptions = () => {
    if (!parts || !last) return;
    // Keep your place: the switch you just used stays focused
    const focused = parts.opts.contains(document.activeElement) ? document.activeElement : null;
    const again = focused?.dataset.pick ? `[data-pick="${CSS.escape(focused.dataset.pick)}"]`
      : focused?.dataset.earlier ? `[data-earlier="${CSS.escape(focused.dataset.earlier)}"]`
        : focused?.dataset.rpick ? `[data-rpick="${focused.dataset.rpick}"]` : null;
    setHTML(parts.opts, single ? referralOptions(last) : summaryOptions(last));
    if (again) parts.opts.querySelector(again)?.focus({ preventScroll: true });
    parts.days.forEach((input) => { input.checked = Number(input.value) === state.days; });
    const r = last.reports[0];
    parts.sub.textContent = single
      ? `${r ? r.name : 'Patient'} · ${wardDay(last.v.date)}`
      : `${wardDay(last.v.date)} · ${plural(last.reports.length, 'patient')}`;
  };

  const rebuild = () => {
    last = build();
    if (!last || !parts) return;
    generated = last.text;
    parts.text.value = last.text;
    drawOptions();
  };

  /** Change an option and write the report again (asking first when you've typed in it). */
  const apply = async (change) => {
    if (parts.text.value !== generated && !(await confirmDialog({ title: 'Write the report again?', message: 'What you typed in the report will be replaced.', confirmLabel: 'Write it again', cancelLabel: 'Keep my text' }))) {
      drawOptions(); // put the switches back as they were
      return;
    }
    change();
    rebuild();
  };

  /** A short message under Copy (a toast would be hidden behind this full-screen window). */
  const say = (message, ok = true) => {
    clearTimeout(sayTimer);
    parts.status.textContent = message;
    parts.status.classList.toggle('is-bad', !ok);
    parts.status.hidden = false;
    sayTimer = setTimeout(() => { parts.status.hidden = true; }, 6000);
  };
  const legacyCopy = () => {
    parts.text.focus();
    parts.text.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  };
  /** Copy straight away (an iPhone allows it only while handling the tap). */
  const copy = () => {
    const value = parts.text.value;
    const done = (ok) => {
      if (ok) {
        copied = value;
        say('Copied. Paste it into your message.');
      } else say('Couldn’t copy here. Select the text and copy it yourself.', false);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value).then(() => done(true), () => done(legacyCopy()));
    else done(legacyCopy());
  };
  const share = async () => {
    const value = parts.text.value;
    try {
      await navigator.share({ text: value });
      copied = value;
    } catch (err) {
      if (err?.name !== 'AbortError') say('Couldn’t share from here. Use Copy instead.', false);
    }
  };

  await openDialog({
    variant: 'full',
    className: 'ward-report accent-neuro',
    dismissible: false,
    body: html`<header class="ptb__bar">
        <div class="ptb__who">
          <h2 class="ptb__name" id="rpt-title">${single ? 'Referral' : 'Rounds report'}</h2>
          <p class="ptd__meta" data-rpt-sub></p>
        </div>
        <div class="ptb__acts">
          <button type="button" class="btn btn--sm" data-ract="setup">${icon('sliders')}Setup</button>
          <button type="button" class="btn btn--sm" data-ract="close">${icon('x')}Close</button>
        </div>
      </header>
      <div class="ptb__main rpt">
        <div class="ward-arrange-by rpt__days">
          <span class="ward-arrange-by__label" id="rpt-days-label">What’s new from</span>
          <div class="segmented" role="radiogroup" aria-labelledby="rpt-days-label">
            <label class="segmented__opt"><input type="radio" name="rpt-days" value="1" checked><span>Today</span></label>
            <label class="segmented__opt"><input type="radio" name="rpt-days" value="2"><span>Today + yesterday</span></label>
          </div>
        </div>
        <div class="rpt__opts" data-rpt-opts></div>
        <label class="field rpt__field"><span class="field__label">${single ? 'Referral' : 'Report'} — change anything before you copy it</span>
          <textarea class="input textarea rpt__text" data-rpt-text rows="16" autocapitalize="sentences"></textarea></label>
        <div class="rpt__acts">
          <button type="button" class="btn btn--primary" data-ract="copy">${icon('copy')}Copy</button>
          ${canShare() ? html`<button type="button" class="btn" data-ract="share">${icon('share')}Share</button>` : ''}
        </div>
        <p class="rpt__status" data-rpt-status role="status" aria-live="polite" hidden></p>
        <p class="rpt__foot">${icon('lock')}<span>Nothing is sent from here: the text stays on this device until you copy or share it. What you type here isn’t saved to the logsheet.</span></p>
        <button type="button" class="btn btn--block ptb__close" data-ract="close">Close</button>
      </div>`,
    onOpen(dlg, close) {
      dlg.setAttribute('aria-labelledby', 'rpt-title');
      parts = {
        opts: dlg.querySelector('[data-rpt-opts]'),
        text: dlg.querySelector('[data-rpt-text]'),
        sub: dlg.querySelector('[data-rpt-sub]'),
        status: dlg.querySelector('[data-rpt-status]'),
        days: [...dlg.querySelectorAll('input[name="rpt-days"]')],
      };
      rebuild();
      setTimeout(() => dlg.querySelector('[data-ract="copy"]')?.focus({ preventScroll: true }), 80);

      dlg.addEventListener('toggle', (event) => {
        if (event.target.matches?.('.rpt__who')) state.whoOpen = event.target.open;
      }, true);
      dlg.addEventListener('change', (event) => {
        const input = event.target;
        if (input.name === 'rpt-days') apply(() => { state.days = Number(input.value) === 2 ? 2 : 1; });
        else if (input.dataset.pick) {
          const { pick } = input.dataset;
          const on = input.checked;
          apply(() => { if (on) state.chosen.add(pick); else state.chosen.delete(pick); });
        } else if (input.dataset.earlier) {
          const { earlier } = input.dataset;
          const on = input.checked;
          apply(() => { state.earlier.set(earlier, on); });
        }
      });
      dlg.addEventListener('click', async (event) => {
        const pick = event.target.closest('[data-rpick]');
        if (pick && last?.order) {
          const which = pick.dataset.rpick;
          apply(() => {
            state.chosen = new Set(last.order.filter((p) => which === 'all' || (which === 'rounded' && p.rounded)).map((p) => p.id));
          });
          return;
        }
        const act = event.target.closest('[data-ract]')?.dataset.ract;
        if (act === 'copy') copy();
        else if (act === 'share') share();
        else if (act === 'setup') {
          if (await openReportSetup(listId)) apply(() => {});
        } else if (act === 'close') {
          const value = parts.text.value;
          if (value !== generated && value !== copied && !(await confirmDialog({ title: 'Close without copying?', message: 'What you typed in the report will be lost — it isn’t saved anywhere.', confirmLabel: 'Close', cancelLabel: 'Keep editing', destructive: true }))) return;
          clearTimeout(sayTimer);
          close(null);
        }
      });
    },
  });
}
