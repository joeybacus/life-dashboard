/* Calendar integration.
   The dashboard asks a "provider" for events. Phase 1 ships a sample provider;
   a later phase adds a Google Calendar provider (via Apps Script) with the same
   shape, so the dashboard won't need to change.

   Event shape: { id, title, start: Date, end: Date, allDay, location,
                  description, calendar, color, url|null, sample } */
import { state } from '../core/state.js';
import { addDays, atTime, startOfDay, toDateKey } from '../core/dates.js';

const SAMPLE_CALENDARS = {
  hospital: { name: 'Hospital', color: '#4f8bff' },
  residency: { name: 'Residency', color: '#34d399' },
  mba: { name: 'MBA', color: '#b388ff' },
};

// The same example day repeats every day, so the dashboard always has "today".
const SAMPLE_DAY = [
  { key: 'rounds', title: 'Morning Rounds', start: '08:00', end: '09:00', cal: 'hospital', location: 'Ward 4B', description: 'Daily patient rounds with the neurology team.' },
  { key: 'journal', title: 'Journal Club', start: '12:30', end: '13:15', cal: 'residency', location: 'Library, Room 3', description: 'Discussing a recent stroke-prevention trial.' },
  { key: 'conference', title: 'Neurology Conference', start: '14:00', end: '16:00', cal: 'residency', location: 'Auditorium B', description: 'Grand rounds: advances in epilepsy care.' },
  { key: 'mba', title: 'MBA Study Group', start: '18:30', end: '19:30', cal: 'mba', location: 'Zoom', description: 'Strategy case preparation.' },
];

const sampleProvider = {
  id: 'sample',
  label: 'Sample calendar',
  connected: true,
  async getEvents(from, to) {
    const events = [];
    for (let day = startOfDay(from); day < to; day = addDays(day, 1)) {
      const key = toDateKey(day);
      for (const e of SAMPLE_DAY) {
        const start = atTime(key, e.start);
        const end = atTime(key, e.end);
        if (end <= from || start >= to) continue;
        const cal = SAMPLE_CALENDARS[e.cal];
        events.push({
          id: `sample-${key}-${e.key}`,
          title: e.title,
          start,
          end,
          allDay: false,
          location: e.location,
          description: e.description,
          calendar: cal.name,
          color: cal.color,
          url: null,
          sample: true,
        });
      }
    }
    return events.sort((a, b) => a.start - b.start);
  },
};

const notConnected = {
  id: 'none',
  label: 'Google Calendar · not connected yet',
  connected: false,
  async getEvents() { return []; },
};

export function calendarProvider() {
  const s = state.settings.sampleData;
  return s.enabled && s.calendar ? sampleProvider : notConnected;
}

/** Today's events plus the event in progress or next up (looking up to a week ahead). */
export async function getAgenda(now = new Date()) {
  const provider = calendarProvider();
  const dayStart = startOfDay(now);
  const dayEnd = addDays(dayStart, 1);
  let events = [];
  try {
    events = await provider.getEvents(dayStart, addDays(dayStart, 8));
  } catch (err) {
    console.warn('Calendar unavailable', err);
    return { provider, today: [], next: null, error: true };
  }
  const today = events.filter((e) => e.start < dayEnd && e.end > dayStart);
  const next = events.find((e) => !e.allDay && e.end > now) ?? null;
  return { provider, today, next, error: false };
}
