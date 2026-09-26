/* Import from Hevy and export workouts — the screens around hevy.js. */
import { html } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { openDialog, toast } from '../../core/ui.js';
import { state, updateSettings } from '../../core/state.js';
import { formatDate } from '../../core/dates.js';
import { shareOrDownload } from '../../services/backup.js';
import { loadLibrary } from './library.js';
import { loadWorkouts, workoutsChanged } from './model.js';
import { ImportError, applyHevyImport, planHevyImport, readHevyCsv, undoHevyImport, workoutsToHevyCsv } from './hevy.js';

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/** Read a Hevy CSV, show what would be imported, then import it (with Undo). */
export async function importHevyFile(file) {
  if (!file) return;
  let plan;
  try {
    if (file.size > 60 * 1024 * 1024) throw new ImportError('This file is too large to be a Hevy export.');
    const parsed = readHevyCsv(await file.text());
    const [library, existing] = await Promise.all([loadLibrary(), loadWorkouts()]);
    plan = planHevyImport(parsed, { library, existing });
  } catch (err) {
    if (!(err instanceof ImportError)) console.error(err);
    toast(err instanceof ImportError ? err.message : 'This file couldn’t be read. Is it the CSV file from Hevy?', { icon: 'info', duration: 7000 });
    return;
  }

  const effortIsRir = state.settings.workout.effort === 'rir';
  const newNames = plan.exercises.map((e) => e.name);
  const fact = (label, value) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const choice = await openDialog({
    variant: 'modal',
    className: 'import-dialog',
    title: plan.workouts.length ? 'Import from Hevy?' : 'Nothing new to import',
    body: html`<div class="restore">
      <dl class="restore__facts">
        ${fact('Workouts in file', plan.total.toLocaleString())}
        ${fact('Dates', `${formatDate(plan.firstDate)} – ${formatDate(plan.lastDate)}`)}
        ${fact('New workouts', plan.workouts.length.toLocaleString())}
        ${fact('Sets', plan.sets.toLocaleString())}
      </dl>
      ${plan.skipped ? html`<p class="note">${icon('info')}<span>${plural(plan.skipped, 'workout')} ${plan.skipped === 1 ? 'is' : 'are'} already in your history, so ${plan.skipped === 1 ? 'it’s' : 'they’re'} skipped.</span></p>` : ''}
      ${plan.workouts.length ? html`<p class="restore__choice">${plural(plan.matchedCount, 'exercise')} matched your library.${newNames.length
        ? html` ${plural(newNames.length, 'new custom exercise')} will be added: <strong>${newNames.slice(0, 6).join(', ')}${newNames.length > 6 ? `, and ${newNames.length - 6} more` : ''}</strong>. You can check ${newNames.length === 1 ? 'its' : 'their'} muscle groups later in Exercises.`
        : ''}</p>` : ''}
      ${plan.unit === 'lb' ? html`<p class="note">${icon('scale')}<span>Weights were in pounds; they’re converted to kilograms.</span></p>` : ''}
      ${plan.badRows ? html`<p class="note">${icon('info')}<span>${plural(plan.badRows, 'row')} without a date or exercise name couldn’t be read and will be left out.</span></p>` : ''}
      ${plan.workouts.length && plan.hasRpe && effortIsRir ? html`<label class="row import-rpe">
        <span class="row__text"><span class="row__label">Show RPE instead of RIR</span><span class="row__sub">Your Hevy sets record effort as RPE</span></span>
        <input type="checkbox" class="switch" switch data-use-rpe checked>
      </label>` : ''}
    </div>`,
    actions: plan.workouts.length
      ? [{ label: 'Cancel', value: 'cancel', variant: 'ghost', autofocus: true }, { label: `Import ${plural(plan.workouts.length, 'workout')}`, value: 'import', variant: 'primary' }]
      : [{ label: 'OK', value: 'cancel', variant: 'primary' }],
    onOpen(dlg) {
      dlg.querySelector('[data-dialog-value="import"]')?.addEventListener('click', () => {
        plan.useRpe = Boolean(dlg.querySelector('[data-use-rpe]')?.checked);
      });
    },
  });
  if (choice !== 'import') return;

  try {
    await applyHevyImport(plan);
  } catch (err) {
    console.error(err);
    toast('The import didn’t finish, so nothing was changed. Please try again.', { icon: 'info', duration: 6000 });
    return;
  }
  if (plan.useRpe) await updateSettings((s) => { s.workout.effort = 'rpe'; }, { source: 'import' });
  workoutsChanged('import');
  toast(`Imported ${plural(plan.workouts.length, 'workout')} from Hevy.`, {
    icon: 'download',
    duration: 8000,
    action: {
      label: 'Undo',
      onClick: async () => {
        await undoHevyImport(plan);
        workoutsChanged('import');
        toast('Import undone.', { icon: 'download' });
      },
    },
  });
}

/** All finished workouts as a CSV file (Hevy's columns, in kg) — opens in Numbers, Excel or Google Sheets. */
export async function exportWorkoutsCsv() {
  const workouts = (await loadWorkouts()).filter((w) => w.endedAt && !w.sample);
  if (!workouts.length) {
    toast('There are no workouts to export yet (sample workouts aren’t included).', { icon: 'info' });
    return;
  }
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `LifeDashboard_Workouts_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`;
  const file = new File([workoutsToHevyCsv(workouts)], name, { type: 'text/csv' });
  const result = await shareOrDownload(file);
  if (result === 'downloaded') toast(`Exported ${plural(workouts.length, 'workout')} to your Downloads.`, { icon: 'download' });
  else if (result === 'shared') toast(`Exported ${plural(workouts.length, 'workout')}.`, { icon: 'share' });
  else if (result === 'needs-tap') toast('Tap Export again to choose where to save it.', { icon: 'share' });
}
