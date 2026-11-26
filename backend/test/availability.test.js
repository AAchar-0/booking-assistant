import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSlots, groupByStart } from '../src/domain/availability.js';
import { zonedToUtc } from '../src/time/zones.js';

const tz = 'Africa/Nairobi';
const FRIDAY = '2026-11-27';
const at = (time, date = FRIDAY) => zonedToUtc(date, time, tz);
const longAgo = Date.parse('2026-01-01T00:00:00Z');
const base = { date: FRIDAY, timeZone: tz, durationMinutes: 30, nowMs: longAgo, stepMinutes: 15, minNoticeMinutes: 0 };
const amina = { id: 1, name: 'Amina', hours: [{ weekday: 5, start: '09:00', end: '10:00' }] };

test('slots fill the opening hours on the grid and the last one ends exactly at closing', () => {
  const slots = computeSlots({ ...base, staff: [amina], bookings: [] });
  assert.deepEqual(slots.map((s) => new Date(s.startMs).toISOString().slice(11, 16)), ['06:00', '06:15', '06:30']);   // 09:00-09:30 local ...
  assert.equal(slots.at(-1).endMs, at('10:00'));
});

test('a booking removes every slot that overlaps it, but touching slots stay', () => {
  const booking = { staffId: 1, startMs: at('09:15'), endMs: at('09:45') };
  const slots = computeSlots({ ...base, staff: [amina], bookings: [booking] });
  assert.deepEqual(slots.map((s) => s.startMs), []);                      // 09:00-09:30 and 09:15-09:45 clash, 09:30-10:00 clashes
  const earlier = computeSlots({ ...base, durationMinutes: 15, staff: [amina], bookings: [booking] });
  assert.deepEqual(earlier.map((s) => s.startMs), [at('09:00'), at('09:45')]);   // 09:00-09:15 touches the booking: allowed
});

test('days without opening hours have no slots', () => {
  assert.deepEqual(computeSlots({ ...base, date: '2026-11-29', staff: [amina], bookings: [] }), []);   // Sunday
});

test('minimum notice hides slots that start too soon', () => {
  const slots = computeSlots({ ...base, nowMs: at('08:30'), minNoticeMinutes: 30, staff: [amina], bookings: [] });
  assert.equal(slots[0].startMs, at('09:00'));
  const later = computeSlots({ ...base, nowMs: at('08:31'), minNoticeMinutes: 30, staff: [amina], bookings: [] });
  assert.equal(later[0].startMs, at('09:15'));
});

test('several staff: grouped by start time, bookings only block their own person', () => {
  const brian = { id: 2, name: 'Brian', hours: [{ weekday: 5, start: '09:00', end: '09:30' }] };
  const slots = computeSlots({ ...base, staff: [amina, brian], bookings: [{ staffId: 1, startMs: at('09:00'), endMs: at('09:30') }] });
  const grouped = groupByStart(slots);
  const nine = grouped.find((g) => g.startMs === at('09:00'));
  assert.deepEqual(nine.staffIds, [2]);                                    // Amina is busy, Brian is free
  assert.deepEqual(grouped.find((g) => g.startMs === at('09:30')).staffIds, [1]);
});

test('a service longer than the opening window gives no slots', () => {
  assert.deepEqual(computeSlots({ ...base, durationMinutes: 90, staff: [amina], bookings: [] }), []);
});

test('split shifts (morning and afternoon) both produce slots', () => {
  const split = { id: 3, name: 'Split', hours: [{ weekday: 5, start: '09:00', end: '09:30' }, { weekday: 5, start: '14:00', end: '14:30' }] };
  const slots = computeSlots({ ...base, staff: [split], bookings: [] });
  assert.deepEqual(slots.map((s) => s.startMs), [at('09:00'), at('14:00')]);
});
