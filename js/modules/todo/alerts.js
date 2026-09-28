/* Reminders: when they ring, and what happens after (Snooze, Stop, follow-ups).
   Plain helpers with no database or screen — the reminder engine (reminders.js)
   and the task screens use them, and tools/todo-checks.html tests them.

   A reminder, in a task's or subtask's "reminders" list:
     { id, kind: 'before', minutes, createdAt }  minutes before the item's time — or,
         for an item with a date but no time, before the default reminder time
         (Settings → Tasks → Reminders, 8:00 AM)
     { id, kind: 'at', at: ISO, createdAt }       an exact date and time
   The sync script reads the same shape to make Google Calendar alerts.

   What has already rung is kept on the item ("alerts"), so it syncs and a
   reminder never rings twice:
     seen   { 'reminderId@dueISO': ISO it rang }  — a changed time is a new key, so it rings again
     snooze { at: ISO }                           — rings again then
     follow { next: ISO | null, count, off }      — "Still not done" follow-ups: when the next
                                                     one rings, how many have rung, and whether
                                                     you chose Stop follow-ups
   Follow-ups use the same settings as the sync script's Calendar follow-ups. */
import { addDays, at, clockOf, formatClock, formatDay, formatDayYear, isClock, relativeDay, todayKey } from '../../core/manila.js';

export const REMINDER_PRESETS = [10, 30, 60];
export const SNOOZE_PRESETS = [10, 30, 60];
export const FOLLOW_CHOICES = [60, 120, 180, 240];
/** Reminders missed for longer than this are skipped quietly (the task shows as overdue anyway). */
export const MISSED_DAYS = 7;
/** A reminder banner nobody touches counts as Stop after this long. */
export const BANNER_TIMEOUT_MS = 5 * 60_000;
const SEEN_KEEP_DAYS = 30;

export const DEFAULT_FOLLOWUPS = { enabled: true, minutes: 120, limit: 2, quiet: true, quietStart: '22:00', quietEnd: '08:00', highMinutes: 0 };

const numberIn = (value, min, max, fallback) => {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
};

/** Settings → Tasks, with defaults for anything missing (the same rules as the sync script). */
export function reminderSettings(tasks = {}) {
  const fu = tasks.followUps ?? {};
  const d = DEFAULT_FOLLOWUPS;
  return {
    defaultTime: isClock(tasks.defaultTime) ? tasks.defaultTime : '08:00',
    followUps: {
      enabled: fu.enabled == null ? d.enabled : Boolean(fu.enabled),
      minutes: numberIn(fu.minutes, 5, 1440, d.minutes),
      limit: numberIn(fu.limit, 1, 5, d.limit),
      quiet: fu.quiet == null ? d.quiet : Boolean(fu.quiet),
      quietStart: isClock(fu.quietStart) ? fu.quietStart : d.quietStart,
      quietEnd: isClock(fu.quietEnd) ? fu.quietEnd : d.quietEnd,
      highMinutes: numberIn(fu.highMinutes, 5, 1440, 0),
    },
  };
}

/* ---------- Words ---------- */

/** "10 min", "1 hour", "2 hours", "1 day", "90 min". */
export function minutesText(m) {
  if (m >= 1440 && m % 1440 === 0) return `${m / 1440} ${m === 1440 ? 'day' : 'days'}`;
  if (m >= 60 && m % 60 === 0) return `${m / 60} ${m === 60 ? 'hour' : 'hours'}`;
  return `${m} min`;
}

/** "30 min before", "At the time", or "Wed, Sep 30, 7:00 AM" for an exact time. */
export function reminderLabel(r, now = Date.now()) {
  if (r?.kind === 'at') {
    const ms = Date.parse(r.at);
    if (!Number.isFinite(ms)) return 'A set time';
    return `${dayWords(todayKey(ms), todayKey(now))}, ${formatClock(clockOf(ms))}`;
  }
  const m = Number(r?.minutes) || 0;
  return m === 0 ? 'At the time' : `${minutesText(m)} before`;
}

/** "Today", "Tomorrow", "Wed, Sep 30", or "Mar 3, 2027". */
function dayWords(key, today) {
  const near = relativeDay(key, today);
  if (near === 'Today' || near === 'Tomorrow' || near === 'Yesterday') return near;
  return key.slice(0, 4) === today.slice(0, 4) ? formatDay(key) : formatDayYear(key);
}

/** "Today, 7:30 PM" — when something rings. */
export function alertTimeText(ms, now = Date.now()) {
  return `${dayWords(todayKey(ms), todayKey(now))}, ${formatClock(clockOf(ms))}`;
}

/* ---------- When reminders ring ---------- */

/** When a reminder rings (ms), or null (a "before" reminder on an item without a date). */
export function reminderDue(item, r, defaultTime = '08:00') {
  if (!r) return null;
  if (r.kind === 'at') {
    const ms = Date.parse(r.at);
    return Number.isFinite(ms) ? ms : null;
  }
  if (!item.date) return null;
  const minutes = Number(r.minutes);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  return at(item.date, item.startTime || defaultTime).getTime() - minutes * 60_000;
}

export const reminderKey = (r, due) => `${r.id}@${new Date(due).toISOString()}`;

/** Can this item ring at all? Done, deleted and sample items never do. */
export const canRing = (item) => Boolean(item) && item.status !== 'done' && !item.deletedAt && !item.sample && !item.parentGone;

/** Follow-up rules for one item: its own choice, else Settings (sooner for High priority when set). */
export function followRules(item, settings) {
  const base = settings.followUps;
  const own = item.followUp && typeof item.followUp === 'object' ? item.followUp : {};
  const usual = item.priority === 'high' && base.highMinutes ? base.highMinutes : base.minutes;
  return {
    enabled: own.enabled == null ? base.enabled : Boolean(own.enabled),
    minutes: numberIn(own.minutes, 5, 1440, usual),
    limit: numberIn(own.limit, 1, 5, base.limit),
    quiet: base.quiet,
    quietStart: base.quietStart,
    quietEnd: base.quietEnd,
  };
}

const clockMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** A time inside quiet hours (Manila time) moves to when they end — usually the next morning. */
export function outOfQuiet(ms, rules) {
  if (!rules.quiet) return ms;
  const start = clockMin(rules.quietStart);
  const end = clockMin(rules.quietEnd);
  if (start === end) return ms;
  const whole = Math.floor(ms / 60_000);
  const minute = (((whole + 480) % 1440) + 1440) % 1440;
  const quiet = start < end ? minute >= start && minute < end : minute >= start || minute < end;
  if (!quiet) return ms;
  return (whole + ((end - minute + 1440) % 1440)) * 60_000;
}

/**
 * What should ring for one item at `now`, earliest first:
 * [{ type: 'reminder' | 'snooze' | 'follow', due, key, reminder? }].
 * A reminder whose time had already passed when it was set is never rung late,
 * and reminders missed by more than a week are skipped.
 */
export function dueAlerts(item, settings, now = Date.now()) {
  if (!canRing(item)) return [];
  const a = item.alerts ?? {};
  const seen = a.seen ?? {};
  const out = [];
  (item.reminders ?? []).forEach((r) => {
    const due = reminderDue(item, r, settings.defaultTime);
    if (due == null || due > now || now - due > MISSED_DAYS * 864e5) return;
    const key = reminderKey(r, due);
    if (seen[key]) return;
    if (r.createdAt && Date.parse(r.createdAt) > due + 60_000) return;
    out.push({ type: 'reminder', due, key, reminder: r });
  });
  const snoozeAt = Date.parse(a.snooze?.at ?? '');
  if (Number.isFinite(snoozeAt) && snoozeAt <= now) out.push({ type: 'snooze', due: snoozeAt, key: `snooze@${a.snooze.at}` });
  const followAt = Date.parse(a.follow?.next ?? '');
  if (!a.follow?.off && Number.isFinite(followAt) && followAt <= now) out.push({ type: 'follow', due: followAt, key: `follow@${a.follow.next}` });
  return out.sort((x, y) => x.due - y.due);
}

/** The next time this item will ring (ms), or null. */
export function nextAlertAt(item, settings, now = Date.now()) {
  if (!canRing(item)) return null;
  const a = item.alerts ?? {};
  const seen = a.seen ?? {};
  const times = [];
  (item.reminders ?? []).forEach((r) => {
    const due = reminderDue(item, r, settings.defaultTime);
    if (due != null && due > now && !seen[reminderKey(r, due)]) times.push(due);
  });
  const snoozeAt = Date.parse(a.snooze?.at ?? '');
  if (Number.isFinite(snoozeAt) && snoozeAt > now) times.push(snoozeAt);
  const followAt = Date.parse(a.follow?.next ?? '');
  if (!a.follow?.off && Number.isFinite(followAt) && followAt > now) times.push(followAt);
  return times.length ? Math.min(...times) : null;
}

/* ---------- After something rings ---------- */

const iso = (ms) => new Date(ms).toISOString();

/** The next follow-up after `from` (null when follow-ups are off, stopped or used up). */
function nextFollow(item, settings, from, count, off) {
  const rules = followRules(item, settings);
  if (!rules.enabled || off || count >= rules.limit || !canRing(item)) return null;
  return iso(outOfQuiet(from + rules.minutes * 60_000, rules));
}

/**
 * It rang (or was listed as missed): remember it, and line up the next follow-up
 * as if you'll tap Stop when the banner times out — so follow-ups still come if
 * the app is closed before you answer.
 */
export function markRung(item, rung, settings, now = Date.now()) {
  const a = item.alerts ?? {};
  const seen = { ...(a.seen ?? {}) };
  let snooze = a.snooze ?? null;
  let follow = a.follow ? { ...a.follow } : { next: null, count: 0, off: false };
  let restart = false;
  rung.forEach((x) => {
    if (x.type === 'reminder') {
      seen[x.key] = iso(now);
      restart = true; // a new reminder starts a new round of follow-ups
    } else if (x.type === 'snooze') {
      snooze = null;
      restart = true;
    } else if (x.type === 'follow') {
      follow.count = (follow.count ?? 0) + 1;
    }
  });
  if (restart) follow = { next: null, count: 0, off: false };
  follow.next = nextFollow(item, settings, now + BANNER_TIMEOUT_MS, follow.count, follow.off);
  return { ...a, seen, snooze, follow };
}

/** Stop (or Open): the next follow-up counts from now. */
export function afterStop(item, settings, now = Date.now()) {
  const a = item.alerts ?? {};
  const follow = { next: null, count: 0, off: false, ...(a.follow ?? {}) };
  follow.next = nextFollow(item, settings, now, follow.count, follow.off);
  return { ...a, follow };
}

/** Snooze: ring again in `minutes`; follow-ups wait until then. */
export function afterSnooze(item, minutes, now = Date.now()) {
  const a = item.alerts ?? {};
  return { ...a, snooze: { at: iso(now + minutes * 60_000) }, follow: { count: 0, off: false, ...(a.follow ?? {}), next: null } };
}

/** Stop follow-ups (on a "Still not done" banner). */
export function afterStopFollowUps(item) {
  const a = item.alerts ?? {};
  return { ...a, follow: { count: 0, ...(a.follow ?? {}), next: null, off: true } };
}

/* ---------- When the item itself changes ---------- */

/** The parts of an item that decide when its reminders ring. */
const scheduleKey = (x) => JSON.stringify([x?.date ?? null, x?.startTime ?? null, x?.endTime ?? null,
  (x?.reminders ?? []).map((r) => [r.id, r.kind, r.minutes ?? null, r.at ?? null])]);

/**
 * The alerts to save with an item. The saved copy is the truth (a sheet open
 * on the screen may hold an older one). Completing or deleting an item ends
 * its snooze and follow-ups; a new date, time or reminder starts afresh — and
 * a reminder whose new time has already passed counts as rung (never rung late).
 */
export function settleAlerts(prev, next, settings, now = Date.now()) {
  const a = { ...(prev?.alerts ?? next.alerts ?? {}) };
  const seen = { ...(a.seen ?? {}) };
  let { snooze = null, follow = null } = a;
  const changed = !prev || scheduleKey(prev) !== scheduleKey(next);
  if (next.status === 'done' || next.deletedAt || (prev && prev.status === 'done' && next.status !== 'done')) {
    snooze = null;
    follow = null;
  }
  if (changed) {
    snooze = null;
    follow = null;
    (next.reminders ?? []).forEach((r) => {
      const due = reminderDue(next, r, settings.defaultTime);
      if (due != null && due <= now) seen[reminderKey(r, due)] = seen[reminderKey(r, due)] ?? iso(now);
    });
  }
  // Keep a month of history, so the list never grows without end
  const cutoff = now - SEEN_KEEP_DAYS * 864e5;
  Object.keys(seen).forEach((k) => {
    const due = Date.parse(k.slice(k.indexOf('@') + 1));
    if (Number.isFinite(due) && due < cutoff) delete seen[k];
  });
  const out = {};
  if (Object.keys(seen).length) out.seen = seen;
  if (snooze) out.snooze = snooze;
  if (follow && (follow.next || follow.off || follow.count)) out.follow = follow;
  return out;
}

/**
 * Does Google Calendar ring for this item (so the app stays quiet)? Only while its
 * link says Linked for the same day — a task moved to another day rings from the
 * app until its event has caught up. (The link comes from the sync script.)
 */
export function calendarRings(item, link) {
  return Boolean(item?.addToCalendar && link && link.status === 'linked' && !link.reason && (link.taskDate ?? '') === (item.date ?? ''));
}

/** A new reminder (the id and time it was set are kept with it). */
export function newReminder(fields, now = Date.now()) {
  return { id: `r${Math.random().toString(36).slice(2, 8)}`, createdAt: iso(now), ...fields };
}

/** The same reminders? (presets are matched by minutes, exact ones by time) */
export const sameReminder = (a, b) => a.kind === b.kind && (a.kind === 'at' ? Date.parse(a.at) === Date.parse(b.at) : Number(a.minutes) === Number(b.minutes));

/** Reminders in a steady order: "before" ones by how early, then exact ones by time. */
export function sortReminders(list) {
  return [...list].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'before' ? -1 : 1;
    return a.kind === 'before' ? Number(b.minutes) - Number(a.minutes) : Date.parse(a.at) - Date.parse(b.at);
  });
}

/** Default "tomorrow morning" for a snooze or a custom reminder: the default reminder time tomorrow. */
export function tomorrowMorning(settings, now = Date.now()) {
  return at(addDays(todayKey(now), 1), settings.defaultTime).getTime();
}
