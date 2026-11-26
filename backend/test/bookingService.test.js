import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, TOMORROW } from '../testkit/world.js';
import { loadConfig } from '../src/config.js';

const code = (c) => (e) => e.code === c;

test('availability lists times for a service and respects staff hours', async () => {
  const w = await makeWorld();
  const result = await w.svc.getAvailability({ serviceId: w.byName['Initial consultation'].id, date: TOMORROW });
  const times = result.slots.map((s) => s.localTime);
  assert.equal(times[0], '09:00');
  assert.equal(times.at(-1), '16:30');                        // 30-minute service must end by 17:00
  assert.ok(result.slots[0].staffIds.length === 2);           // Amina and Brian can both do consultations
  assert.equal(result.timezone, 'Africa/Nairobi');
});

test('booking assigns a staff member; the next customer gets a different one; then the slot is gone', async () => {
  const w = await makeWorld();
  const [u1, u2, u3] = [await w.makeUser(), await w.makeUser(), await w.makeUser()];
  const service = w.byName['Initial consultation'];       // two staff can do it
  const startsAt = w.at(TOMORROW, '10:00');
  const b1 = await w.svc.createBooking({ user: u1, serviceId: service.id, startsAt });
  const b2 = await w.svc.createBooking({ user: u2, serviceId: service.id, startsAt });
  assert.notEqual(b1.staffName, b2.staffName);
  await assert.rejects(w.svc.createBooking({ user: u3, serviceId: service.id, startsAt }), code('SLOT_UNAVAILABLE'));
  const after = await w.svc.getAvailability({ serviceId: service.id, date: TOMORROW });
  assert.ok(!after.slots.some((s) => s.localTime === '10:00'));
});

test('many simultaneous bookings for one slot: exactly as many succeed as there are free staff', async () => {
  const w = await makeWorld();
  const users = await Promise.all(Array.from({ length: 6 }, () => w.makeUser()));
  const service = w.byName['Initial consultation'];
  const results = await Promise.allSettled(users.map((user) =>
    w.svc.createBooking({ user, serviceId: service.id, startsAt: w.at(TOMORROW, '11:00') })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
});

test('rules: past, too soon, too far ahead, outside hours, off-grid and unknown service are refused', async () => {
  const w = await makeWorld();
  const user = await w.makeUser();
  const s = w.byName['Follow-up'].id;
  await assert.rejects(w.svc.createBooking({ user, serviceId: s, startsAt: w.at('2026-11-25', '10:00') }), (e) => e.status === 400);   // yesterday
  w.state.now = Date.parse(w.at('2026-11-26', '09:30'));                                                                              // it is now 09:30
  await assert.rejects(w.svc.createBooking({ user, serviceId: s, startsAt: w.at('2026-11-26', '10:00') }), code('SLOT_UNAVAILABLE')); // inside the 60-minute notice
  await assert.rejects(w.svc.createBooking({ user, serviceId: s, startsAt: w.at('2027-03-01', '10:00') }), (e) => e.status === 400); // beyond 60 days
  await assert.rejects(w.svc.createBooking({ user, serviceId: s, startsAt: w.at(TOMORROW, '20:00') }), code('SLOT_UNAVAILABLE'));      // closed
  await assert.rejects(w.svc.createBooking({ user, serviceId: s, startsAt: w.at(TOMORROW, '10:07') }), (e) => e.status === 400);       // off the 15-minute grid
  await assert.rejects(w.svc.createBooking({ user, serviceId: 999, startsAt: w.at(TOMORROW, '10:00') }), (e) => e.status === 404);
  await assert.rejects(w.svc.createBooking({ user, serviceId: s, startsAt: w.at('2026-11-29', '10:00') }), code('SLOT_UNAVAILABLE')); // Sunday
});

test('a customer cannot double-book themselves or hold too many bookings', async () => {
  const w = await makeWorld();
  const user = await w.makeUser();
  const s = w.byName['Standard session'].id;
  await w.svc.createBooking({ user, serviceId: s, startsAt: w.at(TOMORROW, '10:00') });
  await assert.rejects(w.svc.createBooking({ user, serviceId: w.byName['Follow-up'].id, startsAt: w.at(TOMORROW, '10:15') }), code('OVERLAPS_YOUR_BOOKING'));
  for (const h of ['12:00', '13:00', '14:00', '15:00']) await w.svc.createBooking({ user, serviceId: s, startsAt: w.at(TOMORROW, h) });
  await assert.rejects(w.svc.createBooking({ user, serviceId: s, startsAt: w.at(TOMORROW, '16:00') }), code('TOO_MANY_BOOKINGS'));
});

test('cancellation: owner inside the window is refused, outside is fine, others cannot see it, admin can always', async () => {
  const w = await makeWorld();
  const owner = await w.makeUser();
  const other = await w.makeUser();
  const admin = await w.makeUser({ role: 'ADMIN' });
  const s = w.byName['Follow-up'].id;
  const soon = await w.svc.createBooking({ user: owner, serviceId: s, startsAt: w.at('2026-11-26', '10:00') });   // 2 hours from "now"
  await assert.rejects(w.svc.cancelBooking({ user: other, bookingId: soon.id }), (e) => e.status === 404);          // not yours: looks missing
  w.state.now += 30 * 60_000;                                                                                       // now it is under 2 hours away
  await assert.rejects(w.svc.cancelBooking({ user: owner, bookingId: soon.id }), (e) => e.status === 403);
  assert.equal((await w.svc.cancelBooking({ user: admin, bookingId: soon.id })).status, 'CANCELLED');
  await assert.rejects(w.svc.cancelBooking({ user: admin, bookingId: soon.id }), code('NOT_CANCELLABLE'));

  const later = await w.svc.createBooking({ user: owner, serviceId: s, startsAt: w.at(TOMORROW, '10:00') });
  assert.equal((await w.svc.cancelBooking({ user: owner, bookingId: later.id })).status, 'CANCELLED');
  const again = await w.svc.createBooking({ user: other, serviceId: s, startsAt: w.at(TOMORROW, '10:00') });        // the time is free again
  assert.equal(again.status, 'CONFIRMED');
});

test('admin can list, complete and see statistics', async () => {
  const w = await makeWorld();
  const user = await w.makeUser({ name: 'Zed Customer' });
  const booking = await w.svc.createBooking({ user, serviceId: w.byName['Follow-up'].id, startsAt: w.at(TOMORROW, '10:00') });
  const list = await w.svc.adminListBookings({ from: TOMORROW, to: TOMORROW });
  assert.equal(list.length, 1);
  assert.equal(list[0].customerName, 'Zed Customer');
  assert.equal((await w.svc.adminSetStatus({ bookingId: booking.id, status: 'COMPLETED' })).status, 'COMPLETED');
  assert.equal((await w.svc.adminListBookings({ from: TOMORROW, to: TOMORROW, status: 'CONFIRMED' })).length, 0);
  w.state.now += 3 * 86_400_000;
  const stats = await w.svc.adminStats();
  assert.equal(stats.byStatus.COMPLETED, 1);
  assert.equal(stats.topServices[0].name, 'Follow-up');
});

test('a different business time zone and slot size change the offered times', async () => {
  const w = await makeWorld({ env: { SLOT_STEP_MINUTES: '30' } });
  const result = await w.svc.getAvailability({ serviceId: w.byName['Follow-up'].id, date: TOMORROW });
  assert.ok(result.slots.every((s) => ['00', '30'].includes(s.localTime.slice(3))));
  assert.equal(loadConfig({ SLOT_STEP_MINUTES: '15' }).booking.slotStepMinutes, 15);
});
