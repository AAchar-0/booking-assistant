// Time zone helpers built on Intl (no libraries).
//
// The key idea: store and compare moments as UTC. Only convert to the business's local clock to decide
// "which hours is the studio open on this date" and to show times to people.
// Dates are plain 'YYYY-MM-DD' strings; times of day are 'HH:MM' strings.

const formatters = new Map();
function formatterFor(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function partsAt(utcMs, timeZone) {
  const out = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(utcMs))) out[p.type] = p.value;
  return { year: +out.year, month: +out.month, day: +out.day, hour: +out.hour, minute: +out.minute, second: +out.second };
}

/** How many milliseconds the zone is ahead of UTC at the given moment (Nairobi: +3 hours, always). */
export function offsetMs(utcMs, timeZone) {
  const p = partsAt(utcMs, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

const pad = (n) => String(n).padStart(2, '0');

/** The wall clock in the zone at a UTC moment: { date: '2026-12-01', time: '10:00', weekday: 2 } (0 = Sunday). */
export function utcToLocal(utcMs, timeZone) {
  const p = partsAt(utcMs, timeZone);
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return { date, time: `${pad(p.hour)}:${pad(p.minute)}`, weekday: weekdayOf(date) };
}

/** Converts a local date and time in the zone to a UTC moment (ms). Handles daylight-saving zones. */
export function zonedToUtc(date, time, timeZone) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let result = guess - offsetMs(guess, timeZone);
  const corrected = guess - offsetMs(result, timeZone);     // second pass fixes the case where the offset changed
  if (corrected !== result) result = corrected;
  return result;
}

/** Day of week of a calendar date: 0 = Sunday ... 6 = Saturday. Does not depend on any time zone. */
export function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export const todayIn = (timeZone, nowMs) => utcToLocal(nowMs, timeZone).date;

/** Whole days from date a to date b (b - a). */
export function daysBetween(a, b) {
  const t = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86_400_000);
}
