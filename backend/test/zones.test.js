import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, utcToLocal, weekdayOf, zonedToUtc } from '../src/time/zones.js';

test('Nairobi is UTC+3 all year', () => {
  assert.equal(new Date(zonedToUtc('2026-11-27', '10:00', 'Africa/Nairobi')).toISOString(), '2026-11-27T07:00:00.000Z');
  assert.equal(new Date(zonedToUtc('2026-06-01', '00:00', 'Africa/Nairobi')).toISOString(), '2026-05-31T21:00:00.000Z');
});

test('daylight saving zones: London in summer and winter', () => {
  assert.equal(new Date(zonedToUtc('2026-07-01', '09:00', 'Europe/London')).toISOString(), '2026-07-01T08:00:00.000Z');   // BST, UTC+1
  assert.equal(new Date(zonedToUtc('2026-12-01', '09:00', 'Europe/London')).toISOString(), '2026-12-01T09:00:00.000Z');   // GMT
  // The day the clocks go back (25 Oct 2026) is 25 hours long.
  const start = zonedToUtc('2026-10-25', '00:00', 'Europe/London');
  const next = zonedToUtc('2026-10-26', '00:00', 'Europe/London');
  assert.equal((next - start) / 3_600_000, 25);
});

test('utcToLocal and zonedToUtc are inverses', () => {
  for (const tz of ['Africa/Nairobi', 'Europe/London', 'America/New_York', 'Asia/Kolkata']) {
    const ms = Date.parse('2026-08-15T13:45:00Z');
    const local = utcToLocal(ms, tz);
    assert.equal(zonedToUtc(local.date, local.time, tz), ms, tz);
  }
});

test('local date can differ from the UTC date', () => {
  const local = utcToLocal(Date.parse('2026-11-26T22:30:00Z'), 'Africa/Nairobi');
  assert.deepEqual(local, { date: '2026-11-27', time: '01:30', weekday: 5 });
});

test('weekdays and date arithmetic', () => {
  assert.equal(weekdayOf('2026-11-26'), 4);   // Thursday
  assert.equal(weekdayOf('2026-11-29'), 0);   // Sunday
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-11-26', '2026-12-26'), 30);
});
