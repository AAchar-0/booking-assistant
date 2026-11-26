// The availability engine: given opening hours and existing bookings, which start times are free on a date?
// It is a PURE function (same input, same output, no database, no clock), which is why it is easy to test.
import { addDays, weekdayOf, zonedToUtc } from '../time/zones.js';

const MINUTE = 60_000;

/**
 * @param {object} input
 * @param {string} input.date              local calendar date, 'YYYY-MM-DD'
 * @param {string} input.timeZone          the business's time zone
 * @param {number} input.durationMinutes   length of the service
 * @param {Array}  input.staff             [{ id, name, hours: [{ weekday, start: '09:00', end: '17:00' }] }]
 * @param {Array}  input.bookings          [{ staffId, startMs, endMs }]  (only active bookings)
 * @param {number} input.nowMs
 * @param {number} input.stepMinutes       slots start on this grid (15 = :00, :15, :30, :45)
 * @param {number} input.minNoticeMinutes  slots starting sooner than this from now are hidden
 * @returns {Array<{ startMs, endMs, staffId, staffName }>} sorted by start time, then staff id
 */
export function computeSlots({ date, timeZone, durationMinutes, staff, bookings, nowMs, stepMinutes, minNoticeMinutes }) {
  const weekday = weekdayOf(date);
  const earliestStart = nowMs + minNoticeMinutes * MINUTE;
  const slots = [];

  for (const person of staff) {
    const mine = bookings.filter((b) => b.staffId === person.id);
    for (const range of person.hours.filter((h) => h.weekday === weekday)) {
      const opens = zonedToUtc(date, range.start, timeZone);
      const closes = zonedToUtc(date, range.end, timeZone);
      for (let start = opens; start + durationMinutes * MINUTE <= closes; start += stepMinutes * MINUTE) {
        const end = start + durationMinutes * MINUTE;
        if (start < earliestStart) continue;
        // Two time ranges overlap when each starts before the other ends. Touching ends do NOT overlap.
        const clashes = mine.some((b) => start < b.endMs && b.startMs < end);
        if (!clashes) slots.push({ startMs: start, endMs: end, staffId: person.id, staffName: person.name });
      }
    }
  }
  return slots.sort((a, b) => a.startMs - b.startMs || a.staffId - b.staffId);
}

/** One entry per start time, listing every staff member who is free then. This is what a customer sees. */
export function groupByStart(slots) {
  const byStart = new Map();
  for (const s of slots) {
    const entry = byStart.get(s.startMs) ?? { startMs: s.startMs, endMs: s.endMs, staffIds: [] };
    entry.staffIds.push(s.staffId);
    byStart.set(s.startMs, entry);
  }
  return [...byStart.values()];
}

/** The UTC range that covers a whole local day: [midnight, next midnight). */
export function dayRangeUtc(date, timeZone) {
  return { fromMs: zonedToUtc(date, '00:00', timeZone), toMs: zonedToUtc(addDays(date, 1), '00:00', timeZone) };
}
