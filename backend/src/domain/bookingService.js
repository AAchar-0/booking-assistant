// The business rules of the booking system. No HTTP and no SQL in here: it talks to a repository (database)
// and returns plain objects, so the same rules serve the website AND the AI assistant.
import { computeSlots, dayRangeUtc, groupByStart } from './availability.js';
import { addDays, daysBetween, todayIn, utcToLocal } from '../time/zones.js';
import { conflict, forbidden, notFound, badRequest } from '../http/errors.js';
import { RepoError } from '../repo/RepoError.js';

const MINUTE = 60_000;
const HOUR = 3_600_000;

export function createBookingService({ repo, config, clock = () => Date.now() }) {
  const tz = config.business.timezone;
  const rules = config.booking;

  /** Everything needed to answer "what is free on this date for this service?" */
  async function dayContext(serviceId, date) {
    const service = await repo.getService(serviceId);
    if (!service || !service.active) throw notFound('That service does not exist.');

    const now = clock();
    const today = todayIn(tz, now);
    if (daysBetween(today, date) < 0) throw badRequest('That date is in the past.');
    if (daysBetween(today, date) > rules.maxDaysAhead) {
      throw badRequest(`Bookings open up to ${rules.maxDaysAhead} days ahead.`);
    }
    const { fromMs, toMs } = dayRangeUtc(date, tz);
    const schedule = await repo.getSchedule({ serviceId, fromMs, toMs });
    const slots = computeSlots({
      date, timeZone: tz, durationMinutes: service.durationMinutes, staff: schedule.staff, bookings: schedule.bookings,
      nowMs: now, stepMinutes: rules.slotStepMinutes, minNoticeMinutes: rules.minNoticeMinutes,
    });
    return { service, schedule, slots };
  }

  const presentBooking = (b) => ({
    id: b.id, serviceId: b.serviceId, serviceName: b.serviceName, staffName: b.staffName,
    startsAt: b.startsAt, endsAt: b.endsAt, status: b.status, notes: b.notes, createdVia: b.createdVia,
    local: utcToLocal(Date.parse(b.startsAt), tz),
  });

  return {
    presentBooking,

    async listServices() {
      return repo.listServices();
    },

    async getAvailability({ serviceId, date }) {
      const { service, slots } = await dayContext(serviceId, date);
      return {
        date, timezone: tz, service: { id: service.id, name: service.name, durationMinutes: service.durationMinutes },
        slots: groupByStart(slots).map((s) => ({
          startsAt: new Date(s.startMs).toISOString(), endsAt: new Date(s.endMs).toISOString(),
          localTime: utcToLocal(s.startMs, tz).time, staffIds: s.staffIds,
        })),
      };
    },

    async createBooking({ user, serviceId, startsAt, staffId, notes = '', via = 'WEB' }) {
      const startMs = Date.parse(startsAt);
      const stepMs = rules.slotStepMinutes * MINUTE;
      if (startMs % stepMs !== 0) throw badRequest(`Start time must be on a ${rules.slotStepMinutes}-minute mark.`);

      const date = utcToLocal(startMs, tz).date;
      const { service, schedule, slots } = await dayContext(serviceId, date);

      // The chosen start must be one the availability engine offers right now (open hours, notice period, not taken).
      const offered = slots.filter((s) => s.startMs === startMs);
      if (offered.length === 0) throw conflict('SLOT_UNAVAILABLE', 'That time is not available. Please pick another.');
      let candidates = offered.map((s) => s.staffId);
      if (staffId !== undefined) {
        if (!candidates.includes(staffId)) throw conflict('SLOT_UNAVAILABLE', 'That staff member is not free at that time.');
        candidates = [staffId];
      } else {
        // Spread the work fairly: the person with the fewest bookings that day goes first (ties: lowest id).
        const load = (id) => schedule.bookings.filter((b) => b.staffId === id).length;
        candidates.sort((a, b) => load(a) - load(b) || a - b);
      }

      // Customer rules.
      const mine = await repo.listBookingsForCustomer(user.id);
      const active = mine.filter((b) => b.status === 'CONFIRMED' && Date.parse(b.endsAt) > clock());
      if (active.length >= rules.maxActiveBookingsPerCustomer) {
        throw conflict('TOO_MANY_BOOKINGS', `You can hold at most ${rules.maxActiveBookingsPerCustomer} upcoming bookings. Cancel one first.`);
      }
      const endMs = startMs + service.durationMinutes * MINUTE;
      if (active.some((b) => startMs < Date.parse(b.endsAt) && Date.parse(b.startsAt) < endMs)) {
        throw conflict('OVERLAPS_YOUR_BOOKING', 'You already have a booking at that time.');
      }

      // Try each free staff member. If the database says the slot was just taken (someone else was faster), try the next.
      for (const candidate of candidates) {
        try {
          const booking = await repo.createBooking({
            customerId: user.id, staffId: candidate, serviceId: service.id,
            startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString(), notes, via,
          });
          return presentBooking(booking);
        } catch (e) {
          if (!(e instanceof RepoError && e.code === 'SLOT_TAKEN')) throw e;
        }
      }
      throw conflict('SLOT_TAKEN', 'Sorry, that time was just booked by someone else. Please pick another.');
    },

    async listMyBookings(user) {
      return (await repo.listBookingsForCustomer(user.id)).map(presentBooking);
    },

    /** Owners may cancel until `cancelMinHours` before the start; admins may always cancel. */
    async cancelBooking({ user, bookingId }) {
      const booking = await repo.getBooking(bookingId);
      // Same answer for "does not exist" and "belongs to someone else", so ids cannot be probed.
      if (!booking || (booking.customerId !== user.id && user.role !== 'ADMIN')) throw notFound('Booking not found.');
      if (booking.status !== 'CONFIRMED') throw conflict('NOT_CANCELLABLE', 'This booking is not active.');
      if (user.role !== 'ADMIN' && Date.parse(booking.startsAt) - clock() < rules.cancelMinHours * HOUR) {
        throw forbidden(`Bookings can be cancelled up to ${rules.cancelMinHours} hours before the start. Please contact the studio.`);
      }
      return presentBooking(await repo.setBookingStatus(booking.id, 'CANCELLED', new Date(clock()).toISOString()));
    },

    // ---- admin
    async adminListBookings({ from, to, status }) {
      const fromMs = dayRangeUtc(from, tz).fromMs;
      const toMs = dayRangeUtc(to, tz).toMs;
      const rows = await repo.listBookings({ fromMs, toMs, status });
      return rows.map((b) => ({ ...presentBooking(b), customerName: b.customerName, customerEmail: b.customerEmail }));
    },
    async adminSetStatus({ bookingId, status }) {
      const booking = await repo.getBooking(bookingId);
      if (!booking) throw notFound('Booking not found.');
      const updated = await repo.setBookingStatus(bookingId, status, new Date(clock()).toISOString());
      return { ...presentBooking(updated), customerName: updated.customerName, customerEmail: updated.customerEmail };
    },
    async adminListServices() { return repo.listServices({ includeInactive: true }); },
    async adminCreateService(input) { return repo.createService(input); },
    async adminUpdateService(id, changes) {
      try { return await repo.updateService(id, changes); }
      catch (e) { if (e instanceof RepoError && e.code === 'NOT_FOUND') throw notFound('Service not found.'); throw e; }
    },
    async adminStats() {
      const today = todayIn(tz, clock());
      const from = addDays(today, -29);
      const { fromMs } = dayRangeUtc(from, tz);
      const { toMs } = dayRangeUtc(today, tz);
      return { from, to: today, ...(await repo.stats({ fromMs, toMs })) };
    },
  };
}
