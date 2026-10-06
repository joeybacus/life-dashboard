/* Referrals: colour labels (VIP, See first, Under consultant…) and their
   legend. The legend — each label's name, colour and order — is part of the
   referral census's settings, so it syncs between your devices (Ward lists
   tab; never patients). Which patient has which label: patients.js / store.js.
   Labels higher in the legend come first within each day. */
import { CENSUS_ID, censusList, updateList } from '../ward/engine.js';
import { uid } from '../../core/ids.js';

/** The colours to choose from: a name (said by screen readers) and the colour. */
export const COLORS = [
  { id: 'red', name: 'Red', hex: '#ef4444' },
  { id: 'orange', name: 'Orange', hex: '#f97316' },
  { id: 'gold', name: 'Gold', hex: '#eab308' },
  { id: 'green', name: 'Green', hex: '#22c55e' },
  { id: 'teal', name: 'Teal', hex: '#14b8a6' },
  { id: 'blue', name: 'Blue', hex: '#3b82f6' },
  { id: 'purple', name: 'Purple', hex: '#a855f7' },
  { id: 'pink', name: 'Pink', hex: '#ec4899' },
  { id: 'gray', name: 'Gray', hex: '#94a3b8' },
];
export const colorOf = (id) => COLORS.find((c) => c.id === id) ?? COLORS.at(-1);

export const MAX_LABELS = 12;
export const MAX_LABEL_NAME = 30;

const DEFAULT_LEGEND = [
  { id: 'vip', name: 'VIP', color: 'gold' },
  { id: 'first', name: 'See first', color: 'red' },
  { id: 'consultant', name: 'Under consultant', color: 'purple' },
];

/** The legend, in order: [{ id, name, color }]. */
export function legend() {
  const own = censusList()?.def.legend;
  return Array.isArray(own) ? own : DEFAULT_LEGEND;
}

export const cleanLabelName = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_NAME);
export const newLabelId = () => uid().slice(0, 8);

/** Save the legend (labels: [{ id, name, color }], in order). */
export function saveLegend(labels) {
  const clean = labels
    .map((l) => ({ id: String(l.id || newLabelId()), name: cleanLabelName(l.name), color: colorOf(l.color).id }))
    .filter((l) => l.name)
    .slice(0, MAX_LABELS);
  return updateList(CENSUS_ID, (def) => { def.legend = clean; });
}

/** A patient's labels as legend entries, in legend order (unknown ids are left out). */
export function labelsOf(ids) {
  const set = new Set(ids ?? []);
  return legend().filter((l) => set.has(l.id));
}

/** Where a patient's first label is in the legend (patients without one: after everyone). */
export function labelRank(ids) {
  const order = legend().findIndex((l) => (ids ?? []).includes(l.id));
  return order < 0 ? 999 : order;
}
