// PostgreSQL repository. Same methods as memoryRepo.js; this one stores data for real.
// Every query uses placeholders ($1, $2 ...) so user input is never glued into SQL text (that is what stops SQL injection).
// Double bookings are prevented by the DATABASE itself (an exclusion constraint, see db/migrations/001_init.sql),
// so even two requests arriving at the same instant cannot both win.
import pg from 'pg';
import { RepoError } from './RepoError.js';

const iso = (value) => (value instanceof Date ? value.toISOString() : value);

const mapUser = (r) => r && { id: r.id, email: r.email, passwordHash: r.password_hash, fullName: r.full_name, role: r.role, createdAt: iso(r.created_at) };
const mapService = (r) => r && { id: r.id, name: r.name, description: r.description, durationMinutes: r.duration_minutes,
  priceCents: r.price_cents, currency: r.currency.trim(), active: r.active };
const mapBooking = (r) => r && { id: r.id, customerId: r.customer_id, staffId: r.staff_id, serviceId: r.service_id,
  startsAt: iso(r.starts_at), endsAt: iso(r.ends_at), status: r.status, notes: r.notes, createdVia: r.created_via,
  createdAt: iso(r.created_at), cancelledAt: iso(r.cancelled_at), serviceName: r.service_name, durationMinutes: r.duration_minutes,
  staffName: r.staff_name, customerName: r.customer_name, customerEmail: r.customer_email };

// A booking joined with the names people want to see.
const BOOKING_SELECT = `
  SELECT b.*, s.name AS service_name, s.duration_minutes, st.name AS staff_name, u.full_name AS customer_name, u.email AS customer_email
  FROM bookings b
  JOIN services s ON s.id = b.service_id
  JOIN staff st ON st.id = b.staff_id
  JOIN users u ON u.id = b.customer_id`;

export function createPgRepo(databaseUrl, { ssl } = {}) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    // Hosted databases (Neon, Supabase, Render) require an encrypted connection.
    ssl: ssl ?? (/localhost|127\.0\.0\.1/.test(databaseUrl) ? false : { rejectUnauthorized: true }),
  });
  const q = (text, params) => pool.query(text, params);

  return {
    kind: 'postgres',
    pool,
    async ping() { await q('SELECT 1'); return true; },

    async createUser({ email, passwordHash, fullName, role = 'CUSTOMER' }) {
      try {
        const { rows } = await q(
          'INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING *',
          [email, passwordHash, fullName, role]);
        return mapUser(rows[0]);
      } catch (e) {
        if (e.code === '23505') throw new RepoError('EMAIL_TAKEN');     // unique violation
        throw e;
      }
    },
    async findUserByEmail(email) {
      const { rows } = await q('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
      return mapUser(rows[0]);
    },
    async findUserById(id) {
      const { rows } = await q('SELECT * FROM users WHERE id = $1', [id]);
      return mapUser(rows[0]);
    },

    async listServices({ includeInactive = false } = {}) {
      const { rows } = await q(`SELECT * FROM services ${includeInactive ? '' : 'WHERE active'} ORDER BY id`);
      return rows.map(mapService);
    },
    async getService(id) {
      const { rows } = await q('SELECT * FROM services WHERE id = $1', [id]);
      return mapService(rows[0]);
    },
    async createService({ name, description = '', durationMinutes, priceCents, currency = 'KES' }) {
      const { rows } = await q(
        'INSERT INTO services (name, description, duration_minutes, price_cents, currency) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [name, description, durationMinutes, priceCents, currency]);
      return mapService(rows[0]);
    },
    async updateService(id, c) {
      // COALESCE keeps the old value when a field was not supplied.
      const { rows } = await q(
        `UPDATE services SET name = COALESCE($2, name), description = COALESCE($3, description),
           duration_minutes = COALESCE($4, duration_minutes), price_cents = COALESCE($5, price_cents),
           currency = COALESCE($6, currency), active = COALESCE($7, active)
         WHERE id = $1 RETURNING *`,
        [id, c.name ?? null, c.description ?? null, c.durationMinutes ?? null, c.priceCents ?? null, c.currency ?? null, c.active ?? null]);
      if (rows.length === 0) throw new RepoError('NOT_FOUND');
      return mapService(rows[0]);
    },
    async createStaff({ name }) {
      const { rows } = await q('INSERT INTO staff (name) VALUES ($1) RETURNING id, name, active', [name]);
      return rows[0];
    },
    async linkStaffService(staffId, serviceId) {
      await q('INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [staffId, serviceId]);
    },
    async setStaffHours(staffId, rowsIn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM staff_hours WHERE staff_id = $1', [staffId]);
        for (const r of rowsIn) {
          await client.query('INSERT INTO staff_hours (staff_id, weekday, start_time, end_time) VALUES ($1, $2, $3, $4)',
            [staffId, r.weekday, r.start, r.end]);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },

    async getSchedule({ serviceId, fromMs, toMs }) {
      const people = (await q(
        `SELECT st.id, st.name FROM staff st JOIN staff_services ss ON ss.staff_id = st.id
         WHERE ss.service_id = $1 AND st.active ORDER BY st.id`, [serviceId])).rows;
      const ids = people.map((p) => p.id);
      if (ids.length === 0) return { staff: [], bookings: [] };
      const hours = (await q(
        `SELECT staff_id, weekday, to_char(start_time, 'HH24:MI') AS start_hm, to_char(end_time, 'HH24:MI') AS end_hm
         FROM staff_hours WHERE staff_id = ANY($1::int[]) ORDER BY staff_id, weekday, start_time`, [ids])).rows;
      const booked = (await q(
        `SELECT staff_id, starts_at, ends_at FROM bookings
         WHERE staff_id = ANY($1::int[]) AND status IN ('CONFIRMED', 'COMPLETED')
           AND starts_at < $3 AND ends_at > $2`,
        [ids, new Date(fromMs), new Date(toMs)])).rows;
      return {
        staff: people.map((p) => ({ id: p.id, name: p.name,
          hours: hours.filter((h) => h.staff_id === p.id).map((h) => ({ weekday: h.weekday, start: h.start_hm, end: h.end_hm })) })),
        bookings: booked.map((b) => ({ staffId: b.staff_id, startMs: b.starts_at.getTime(), endMs: b.ends_at.getTime() })),
      };
    },

    async createBooking({ customerId, staffId, serviceId, startsAt, endsAt, notes = '', via = 'WEB' }) {
      try {
        const { rows } = await q(
          `INSERT INTO bookings (customer_id, staff_id, service_id, starts_at, ends_at, notes, created_via)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [customerId, staffId, serviceId, startsAt, endsAt, notes, via]);
        return this.getBooking(rows[0].id);
      } catch (e) {
        if (e.code === '23P01') throw new RepoError('SLOT_TAKEN');      // exclusion violation: someone booked it first
        throw e;
      }
    },
    async getBooking(id) {
      const { rows } = await q(`${BOOKING_SELECT} WHERE b.id = $1`, [id]);
      return mapBooking(rows[0]);
    },
    async listBookingsForCustomer(customerId) {
      const { rows } = await q(`${BOOKING_SELECT} WHERE b.customer_id = $1 ORDER BY b.starts_at`, [customerId]);
      return rows.map(mapBooking);
    },
    async listBookings({ fromMs, toMs, status }) {
      const { rows } = await q(
        `${BOOKING_SELECT} WHERE b.starts_at >= $1 AND b.starts_at < $2 AND ($3::text IS NULL OR b.status = $3) ORDER BY b.starts_at`,
        [new Date(fromMs), new Date(toMs), status ?? null]);
      return rows.map(mapBooking);
    },
    async setBookingStatus(id, status, cancelledAtIso = null) {
      const { rows } = await q(
        `UPDATE bookings SET status = $2, cancelled_at = CASE WHEN $2 = 'CANCELLED' THEN $3::timestamptz ELSE cancelled_at END
         WHERE id = $1 RETURNING id`, [id, status, cancelledAtIso]);
      if (rows.length === 0) throw new RepoError('NOT_FOUND');
      return this.getBooking(id);
    },
    async stats({ fromMs, toMs }) {
      const range = [new Date(fromMs), new Date(toMs)];
      const byStatus = {};
      for (const r of (await q('SELECT status, COUNT(*)::int AS n FROM bookings WHERE starts_at >= $1 AND starts_at < $2 GROUP BY status', range)).rows) {
        byStatus[r.status] = r.n;
      }
      const top = (await q(
        `SELECT s.name, COUNT(*)::int AS n FROM bookings b JOIN services s ON s.id = b.service_id
         WHERE b.starts_at >= $1 AND b.starts_at < $2 AND b.status <> 'CANCELLED'
         GROUP BY s.name ORDER BY n DESC, s.name`, range)).rows;
      return { byStatus, topServices: top.map((r) => ({ name: r.name, count: r.n })) };
    },
    async countServices() {
      return (await q('SELECT COUNT(*)::int AS n FROM services')).rows[0].n;
    },
    async close() { await pool.end(); },
  };
}
