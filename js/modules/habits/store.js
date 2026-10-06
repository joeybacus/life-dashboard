/* Habits — what's saved. Habits and one log per habit per Manila day (its id
   is "<habit id>:<date>", so two devices ticking the same day make the same
   record). Both sync (Habits and Habit log tabs, since sync script 5) and are
   in backups. */
import { db } from '../../core/db.js';
import { emit } from '../../core/events.js';
import { saveRecord } from '../../core/records.js';
import { uid } from '../../core/ids.js';
import { nowISO } from '../../core/dates.js';
import { GROUPS, MAX_NAME, cleanSchedule } from './model.js';

export const habitsChanged = () => emit('data', { reason: 'habits' });

/** Every habit (not deleted, in order) and, for each, the days it was done: Map(habit id → Set of days). */
export async function loadHabits() {
  const [habits, logs] = await Promise.all([db.all('habits'), db.all('habitLogs')]);
  const done = new Map();
  logs.forEach((l) => {
    if (!l.done || l.deletedAt || !l.habitId) return;
    if (!done.has(l.habitId)) done.set(l.habitId, new Set());
    done.get(l.habitId).add(l.date);
  });
  const live = habits.filter((h) => !h.deletedAt).map((h) => ({ ...h, schedule: cleanSchedule(h.schedule), group: h.group || GROUPS[0] }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
  return { habits: live, done: (id) => done.get(id) ?? new Set() };
}

const cleanName = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

/** Add or change a habit. fields: { id?, name, group, schedule, active }. */
export async function saveHabit(fields) {
  const now = nowISO();
  const existing = fields.id ? await db.get('habits', fields.id) : null;
  const all = existing ? [] : (await db.all('habits')).filter((h) => !h.deletedAt);
  const record = {
    ...(existing ?? { id: uid(), createdAt: now, deletedAt: null, active: true, order: all.reduce((m, h) => Math.max(m, h.order ?? 0), -1) + 1 }),
    ...fields,
    name: cleanName(fields.name) || existing?.name || 'Habit',
    group: cleanName(fields.group) || existing?.group || GROUPS[0],
    schedule: cleanSchedule(fields.schedule ?? existing?.schedule),
    active: fields.active ?? existing?.active ?? true,
    updatedAt: now,
  };
  await saveRecord('habits', record);
  habitsChanged();
  return record;
}

/** Delete on every device (the history goes with it). */
export async function deleteHabit(id) {
  const existing = await db.get('habits', id);
  if (!existing) return;
  const now = nowISO();
  await saveRecord('habits', { ...existing, deletedAt: now, updatedAt: now });
  habitsChanged();
}

/** Put habits in a new order (ids, first to last). */
export async function reorderHabits(ids) {
  const now = nowISO();
  for (const [i, id] of ids.entries()) {
    const h = await db.get('habits', id);
    if (h && h.order !== i) await saveRecord('habits', { ...h, order: i, updatedAt: now });
  }
  habitsChanged();
}

/** Tick (done = true) or untick a habit for a day. */
export async function setDone(habitId, date, done) {
  const id = `${habitId}:${date}`;
  const now = nowISO();
  const existing = await db.get('habitLogs', id);
  await saveRecord('habitLogs', { id, habitId, date, done: Boolean(done), createdAt: existing?.createdAt ?? now, updatedAt: now, deletedAt: null });
  habitsChanged();
}
