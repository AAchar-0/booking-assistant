// In-memory repository. It has TWO jobs:
//  1. fast, database-free tests of the business rules;
//  2. a "demo mode" so the app runs with `npm start` before any database exists.
// It implements exactly the same methods as pgRepo.js. A shared contract test (test/repo.contract.js) runs against
// both, so the two cannot drift apart. Data is lost when the process stops.
import { RepoError } from './RepoError.js';

const ACTIVE = new Set(['CONFIRMED', 'COMPLETED']);   // statuses that occupy the calendar

export function createMemoryRepo() {
  let nextId = { user: 1, service: 1, staff: 1, booking: 1 };
  const users = [], services = [], staff = [], bookings = [];
  const staffServices = new Set();          // "staffId:serviceId"
  const staffHours = new Map();             // staffId -> [{ weekday, start, end }]
  const clone = (x) => (x === undefined ? undefined : structuredClone(x));

  const view = (b) => {                     // a booking joined with names, like the SQL join in pgRepo
    const service = services.find((s) => s.id === b.serviceId);
    const person = staff.find((s) => s.id === b.staffId);
    const customer = users.find((u) => u.id === b.customerId);
    return clone({ ...b, serviceName: service?.name, durationMinutes: service?.durationMinutes, staffName: person?.name,
      customerName: customer?.fullName, customerEmail: customer?.email });
  };

  return {
    kind: 'memory',
    async ping() { return true; },

    // ---- users
    async createUser({ email, passwordHash, fullName, role = 'CUSTOMER' }) {
      if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new RepoError('EMAIL_TAKEN');
      const user = { id: nextId.user++, email, passwordHash, fullName, role, createdAt: new Date().toISOString() };
      users.push(user);
      return clone(user);
    },
    async findUserByEmail(email) { return clone(users.find((u) => u.email.toLowerCase() === email.toLowerCase())); },
    async findUserById(id) { return clone(users.find((u) => u.id === id)); },

    // ---- services and staff
    async listServices({ includeInactive = false } = {}) {
      return clone(services.filter((s) => includeInactive || s.active).sort((a, b) => a.id - b.id));
    },
    async getService(id) { return clone(services.find((s) => s.id === id)); },
    async createService({ name, description = '', durationMinutes, priceCents, currency = 'KES' }) {
      const service = { id: nextId.service++, name, description, durationMinutes, priceCents, currency, active: true };
      services.push(service);
      return clone(service);
    },
    async updateService(id, changes) {
      const service = services.find((s) => s.id === id);
      if (!service) throw new RepoError('NOT_FOUND');
      for (const key of ['name', 'description', 'durationMinutes', 'priceCents', 'currency', 'active']) {
        if (changes[key] !== undefined) service[key] = changes[key];
      }
      return clone(service);
    },
    async createStaff({ name }) { const s = { id: nextId.staff++, name, active: true }; staff.push(s); return clone(s); },
    async linkStaffService(staffId, serviceId) { staffServices.add(`${staffId}:${serviceId}`); },
    async setStaffHours(staffId, rows) { staffHours.set(staffId, clone(rows)); },

    // ---- scheduling data for one service and one time window
    async getSchedule({ serviceId, fromMs, toMs }) {
      const people = staff.filter((s) => s.active && staffServices.has(`${s.id}:${serviceId}`)).sort((a, b) => a.id - b.id);
      return {
        staff: people.map((p) => ({ id: p.id, name: p.name, hours: clone(staffHours.get(p.id) ?? []) })),
        bookings: bookings
          .filter((b) => people.some((p) => p.id === b.staffId) && ACTIVE.has(b.status)
            && Date.parse(b.startsAt) < toMs && Date.parse(b.endsAt) > fromMs)
          .map((b) => ({ staffId: b.staffId, startMs: Date.parse(b.startsAt), endMs: Date.parse(b.endsAt) })),
      };
    },

    // ---- bookings
    async createBooking({ customerId, staffId, serviceId, startsAt, endsAt, notes = '', via = 'WEB' }) {
      // No `await` between the check and the insert, so in a single Node process this is atomic.
      const clash = bookings.some((b) => b.staffId === staffId && ACTIVE.has(b.status)
        && Date.parse(startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(endsAt));
      if (clash) throw new RepoError('SLOT_TAKEN');
      const booking = { id: nextId.booking++, customerId, staffId, serviceId, startsAt, endsAt, status: 'CONFIRMED',
        notes, createdVia: via, createdAt: new Date().toISOString(), cancelledAt: null };
      bookings.push(booking);
      return view(booking);
    },
    async getBooking(id) { const b = bookings.find((x) => x.id === id); return b ? view(b) : undefined; },
    async listBookingsForCustomer(customerId) {
      return bookings.filter((b) => b.customerId === customerId).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).map(view);
    },
    async listBookings({ fromMs, toMs, status }) {
      return bookings
        .filter((b) => Date.parse(b.startsAt) >= fromMs && Date.parse(b.startsAt) < toMs && (!status || b.status === status))
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).map(view);
    },
    async setBookingStatus(id, status, cancelledAtIso = null) {
      const b = bookings.find((x) => x.id === id);
      if (!b) throw new RepoError('NOT_FOUND');
      b.status = status;
      b.cancelledAt = status === 'CANCELLED' ? cancelledAtIso : b.cancelledAt;
      return view(b);
    },
    async stats({ fromMs, toMs }) {
      const inRange = bookings.filter((b) => Date.parse(b.startsAt) >= fromMs && Date.parse(b.startsAt) < toMs);
      const byStatus = {};
      const byService = new Map();
      for (const b of inRange) {
        byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
        if (b.status !== 'CANCELLED') {
          const name = services.find((s) => s.id === b.serviceId)?.name ?? 'Unknown';
          byService.set(name, (byService.get(name) ?? 0) + 1);
        }
      }
      return { byStatus, topServices: [...byService].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) };
    },
    async countServices() { return services.length; },
    async close() {},
  };
}
