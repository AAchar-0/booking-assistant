// The same checks run against EVERY repository implementation (memory always, PostgreSQL when DATABASE_URL is set).
// If both pass, swapping the database cannot change the app's behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RepoError } from '../src/repo/RepoError.js';

export function runRepoContract(label, makeRepo, { skip = false } = {}) {
  const t = (name, fn) => test(`[${label}] ${name}`, { skip }, async () => {
    const { repo, cleanup } = await makeRepo();
    try { await fn(repo); } finally { await cleanup?.(); }
  });

  async function basics(repo) {
    const customer = await repo.createUser({ email: `c${Date.now()}${Math.random()}@example.com`, passwordHash: 'x', fullName: 'Cee' });
    const service = await repo.createService({ name: 'Cut', durationMinutes: 30, priceCents: 1000 });
    const staff = await repo.createStaff({ name: 'Sam' });
    await repo.linkStaffService(staff.id, service.id);
    await repo.setStaffHours(staff.id, [{ weekday: 1, start: '09:00', end: '17:00' }]);
    return { customer, service, staff };
  }

  t('emails are unique ignoring case', async (repo) => {
    await repo.createUser({ email: 'Ann@Example.com', passwordHash: 'x', fullName: 'Ann' });
    await assert.rejects(repo.createUser({ email: 'ann@example.com', passwordHash: 'x', fullName: 'Ann2' }),
      (e) => e instanceof RepoError && e.code === 'EMAIL_TAKEN');
    assert.equal((await repo.findUserByEmail('ANN@EXAMPLE.COM')).fullName, 'Ann');
  });

  t('services can be created, updated and hidden', async (repo) => {
    const s = await repo.createService({ name: 'A', description: 'd', durationMinutes: 45, priceCents: 5000 });
    assert.equal(s.currency, 'KES');
    const updated = await repo.updateService(s.id, { priceCents: 6000, active: false });
    assert.equal(updated.priceCents, 6000);
    assert.equal((await repo.listServices()).length, 0);
    assert.equal((await repo.listServices({ includeInactive: true })).length, 1);
    await assert.rejects(repo.updateService(9999, { name: 'x' }), (e) => e.code === 'NOT_FOUND');
  });

  t('schedule returns staff, hours and active bookings in the window', async (repo) => {
    const { customer, service, staff } = await basics(repo);
    await repo.createBooking({ customerId: customer.id, staffId: staff.id, serviceId: service.id,
      startsAt: '2026-11-30T07:00:00.000Z', endsAt: '2026-11-30T07:30:00.000Z' });
    const win = { serviceId: service.id, fromMs: Date.parse('2026-11-30T00:00:00Z'), toMs: Date.parse('2026-12-01T00:00:00Z') };
    const schedule = await repo.getSchedule(win);
    assert.deepEqual(schedule.staff.map((s) => [s.id, s.name]), [[staff.id, 'Sam']]);
    assert.deepEqual(schedule.staff[0].hours, [{ weekday: 1, start: '09:00', end: '17:00' }]);
    assert.equal(schedule.bookings.length, 1);
    assert.equal(schedule.bookings[0].startMs, Date.parse('2026-11-30T07:00:00Z'));
    const empty = await repo.getSchedule({ ...win, fromMs: Date.parse('2026-12-02T00:00:00Z'), toMs: Date.parse('2026-12-03T00:00:00Z') });
    assert.equal(empty.bookings.length, 0);
  });

  t('overlapping bookings for one staff member are refused, back-to-back is fine', async (repo) => {
    const { customer, service, staff } = await basics(repo);
    const book = (a, b) => repo.createBooking({ customerId: customer.id, staffId: staff.id, serviceId: service.id, startsAt: a, endsAt: b });
    await book('2026-11-30T07:00:00.000Z', '2026-11-30T07:30:00.000Z');
    await assert.rejects(book('2026-11-30T07:15:00.000Z', '2026-11-30T07:45:00.000Z'), (e) => e.code === 'SLOT_TAKEN');
    await assert.rejects(book('2026-11-30T06:45:00.000Z', '2026-11-30T07:15:00.000Z'), (e) => e.code === 'SLOT_TAKEN');
    await book('2026-11-30T07:30:00.000Z', '2026-11-30T08:00:00.000Z');          // starts exactly when the other ends
  });

  t('simultaneous requests for the same slot: exactly one wins', async (repo) => {
    const { customer, service, staff } = await basics(repo);
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => repo.createBooking({
      customerId: customer.id, staffId: staff.id, serviceId: service.id,
      startsAt: '2026-12-07T07:00:00.000Z', endsAt: '2026-12-07T07:30:00.000Z' })));
    assert.equal(attempts.filter((a) => a.status === 'fulfilled').length, 1);
    assert.ok(attempts.filter((a) => a.status === 'rejected').every((a) => a.reason.code === 'SLOT_TAKEN'));
  });

  t('cancelling frees the time again', async (repo) => {
    const { customer, service, staff } = await basics(repo);
    const first = await repo.createBooking({ customerId: customer.id, staffId: staff.id, serviceId: service.id,
      startsAt: '2026-11-30T07:00:00.000Z', endsAt: '2026-11-30T07:30:00.000Z' });
    const cancelled = await repo.setBookingStatus(first.id, 'CANCELLED', '2026-11-29T10:00:00.000Z');
    assert.equal(cancelled.status, 'CANCELLED');
    await repo.createBooking({ customerId: customer.id, staffId: staff.id, serviceId: service.id,
      startsAt: '2026-11-30T07:00:00.000Z', endsAt: '2026-11-30T07:30:00.000Z' });
  });

  t('bookings come back joined with names and filterable', async (repo) => {
    const { customer, service, staff } = await basics(repo);
    const b = await repo.createBooking({ customerId: customer.id, staffId: staff.id, serviceId: service.id,
      startsAt: '2026-11-30T07:00:00.000Z', endsAt: '2026-11-30T07:30:00.000Z', notes: 'hello', via: 'ASSISTANT' });
    assert.equal(b.serviceName, 'Cut');
    assert.equal(b.staffName, 'Sam');
    assert.equal(b.customerName, 'Cee');
    assert.equal(b.createdVia, 'ASSISTANT');
    assert.equal((await repo.getBooking(b.id)).notes, 'hello');
    assert.equal((await repo.listBookingsForCustomer(customer.id)).length, 1);
    const win = { fromMs: Date.parse('2026-11-30T00:00:00Z'), toMs: Date.parse('2026-12-01T00:00:00Z') };
    assert.equal((await repo.listBookings(win)).length, 1);
    assert.equal((await repo.listBookings({ ...win, status: 'CANCELLED' })).length, 0);
    const stats = await repo.stats(win);
    assert.equal(stats.byStatus.CONFIRMED, 1);
    assert.deepEqual(stats.topServices, [{ name: 'Cut', count: 1 }]);
    await assert.rejects(repo.setBookingStatus(99999, 'COMPLETED'), (e) => e.code === 'NOT_FOUND');
  });
}
