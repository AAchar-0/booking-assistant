// The API, described as DATA: a list of routes. Each handler is a plain async function that receives a small
// context object and returns the JSON to send. Express (server.js) only connects this list to real HTTP.
// Keeping handlers free of Express makes them easy to read and test.
//
// auth: 'none' = anyone, 'user' = logged in, 'admin' = logged in with the ADMIN role.
import { hashPassword, verifyPassword, dummyHashPromise } from './auth/passwords.js';
import { signToken } from './auth/tokens.js';
import { createRateLimiter } from './auth/rateLimit.js';
import { parse, v } from './http/validate.js';
import { conflict, unauthenticated, tooManyRequests, HttpError } from './http/errors.js';
import { RepoError } from './repo/RepoError.js';
import { addDays, todayIn } from './time/zones.js';

export function buildRoutes({ repo, svc, assistant, config, clock = () => Date.now() }) {
  const tz = config.business.timezone;
  // Brute-force protection: attempts per IP+email for logins, per IP for sign-ups, per user for the assistant.
  const loginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 10, now: clock });
  const registerLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 10, now: clock });
  const assistantLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: config.ai.userHourlyLimit, now: clock });

  const limit = (limiter, key) => {
    const r = limiter.hit(key);
    if (!r.allowed) throw tooManyRequests(r.retryAfterSeconds);
  };
  const publicUser = (u) => ({ id: u.id, email: u.email, fullName: u.fullName, role: u.role });
  const issueToken = (user) => signToken({ sub: user.id, role: user.role }, config.jwtSecret, config.tokenTtlSeconds, clock());

  return [
    { method: 'get', path: '/health', auth: 'none', async handler() {
      let database = 'down';
      try { await repo.ping(); database = repo.kind; } catch { /* reported as "down" */ }
      return { status: database === 'down' ? 'degraded' : 'ok', database, assistant: assistant.enabled ? 'on' : 'off' };
    } },

    { method: 'get', path: '/config', auth: 'none', async handler() {
      return {
        businessName: config.business.name, timezone: tz, assistantEnabled: assistant.enabled,
        minNoticeMinutes: config.booking.minNoticeMinutes, maxDaysAhead: config.booking.maxDaysAhead,
        cancelMinHours: config.booking.cancelMinHours, today: todayIn(tz, clock()), demoMode: repo.kind === 'memory',
      };
    } },

    // ---------------------------------------------------------------- accounts
    { method: 'post', path: '/auth/register', auth: 'none', async handler({ body, ip }) {
      limit(registerLimiter, ip);
      const input = parse({
        email: v.email(), fullName: v.string({ min: 1, max: 100 }), password: v.string({ min: 10, max: 128, trim: false }),
      }, body);
      if (input.password.toLowerCase().includes(input.email.split('@')[0]) && input.email.split('@')[0].length >= 4) {
        throw new HttpError(400, 'VALIDATION', 'Some fields are not valid.', { password: 'must not contain your email name' });
      }
      try {
        const user = await repo.createUser({ email: input.email, fullName: input.fullName, passwordHash: await hashPassword(input.password) });
        return { status: 201, body: { token: issueToken(user), user: publicUser(user) } };
      } catch (e) {
        if (e instanceof RepoError && e.code === 'EMAIL_TAKEN') throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');
        throw e;
      }
    } },

    { method: 'post', path: '/auth/login', auth: 'none', async handler({ body, ip }) {
      const input = parse({ email: v.email(), password: v.string({ min: 1, max: 128, trim: false }) }, body);
      limit(loginLimiter, `${ip}|${input.email}`);
      const user = await repo.findUserByEmail(input.email);
      // Always do one password check, even for unknown emails, so timing does not reveal which emails exist.
      const ok = await verifyPassword(input.password, user ? user.passwordHash : await dummyHashPromise);
      if (!user || !ok) throw unauthenticated('Wrong email or password.');
      return { token: issueToken(user), user: publicUser(user) };
    } },

    { method: 'get', path: '/me', auth: 'user', async handler({ user }) { return { user: publicUser(user) }; } },

    // ---------------------------------------------------------------- public catalogue
    { method: 'get', path: '/services', auth: 'none', async handler() {
      return { services: await svc.listServices() };
    } },

    { method: 'get', path: '/availability', auth: 'none', async handler({ query }) {
      const input = parse({ serviceId: v.int({ min: 1 }), date: v.date() }, query);
      return svc.getAvailability(input);
    } },

    // ---------------------------------------------------------------- bookings
    { method: 'post', path: '/bookings', auth: 'user', async handler({ user, body }) {
      const input = parse({
        serviceId: v.int({ min: 1 }), startsAt: v.instant(), staffId: v.int({ min: 1, optional: true }),
        notes: v.string({ max: 500, optional: true }), via: v.oneOf(['WEB', 'ASSISTANT'], { optional: true }),
      }, body);
      const booking = await svc.createBooking({ user, ...input });
      return { status: 201, body: { booking } };
    } },

    { method: 'get', path: '/bookings/mine', auth: 'user', async handler({ user }) {
      return { bookings: await svc.listMyBookings(user) };
    } },

    { method: 'post', path: '/bookings/:id/cancel', auth: 'user', async handler({ user, params }) {
      const { id } = parse({ id: v.int({ min: 1 }) }, params);
      return { booking: await svc.cancelBooking({ user, bookingId: id }) };
    } },

    // ---------------------------------------------------------------- assistant
    { method: 'post', path: '/assistant/chat', auth: 'user', async handler({ user, body }) {
      limit(assistantLimiter, String(user.id));
      return assistant.chat({ user, messages: body?.messages });
    } },

    // ---------------------------------------------------------------- admin
    { method: 'get', path: '/admin/bookings', auth: 'admin', async handler({ query }) {
      const today = todayIn(tz, clock());
      const input = parse({
        from: v.date({}), to: v.date({}),
        status: v.oneOf(['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'], { optional: true }),
      }, { from: today, to: addDays(today, 14), ...query });
      return { bookings: await svc.adminListBookings(input) };
    } },

    { method: 'patch', path: '/admin/bookings/:id', auth: 'admin', async handler({ params, body }) {
      const { id } = parse({ id: v.int({ min: 1 }) }, params);
      const { status } = parse({ status: v.oneOf(['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']) }, body);
      return { booking: await svc.adminSetStatus({ bookingId: id, status }) };
    } },

    { method: 'get', path: '/admin/services', auth: 'admin', async handler() {
      return { services: await svc.adminListServices() };
    } },

    { method: 'post', path: '/admin/services', auth: 'admin', async handler({ body }) {
      const input = parse({
        name: v.string({ min: 1, max: 100 }), description: v.string({ max: 500, optional: true }),
        durationMinutes: v.int({ min: 5, max: 480 }), priceCents: v.int({ min: 0, max: 100_000_000 }),
        currency: v.string({ min: 3, max: 3, optional: true }),
      }, body);
      if (input.durationMinutes % 5 !== 0) throw new HttpError(400, 'VALIDATION', 'Some fields are not valid.', { durationMinutes: 'must be a multiple of 5' });
      return { status: 201, body: { service: await svc.adminCreateService(input) } };
    } },

    { method: 'patch', path: '/admin/services/:id', auth: 'admin', async handler({ params, body }) {
      const { id } = parse({ id: v.int({ min: 1 }) }, params);
      const changes = parse({
        name: v.string({ min: 1, max: 100, optional: true }), description: v.string({ max: 500, optional: true }),
        durationMinutes: v.int({ min: 5, max: 480, optional: true }), priceCents: v.int({ min: 0, max: 100_000_000, optional: true }),
        active: v.boolean({ optional: true }),
      }, body);
      if (changes.durationMinutes !== undefined && changes.durationMinutes % 5 !== 0) {
        throw new HttpError(400, 'VALIDATION', 'Some fields are not valid.', { durationMinutes: 'must be a multiple of 5' });
      }
      return { service: await svc.adminUpdateService(id, changes) };
    } },

    { method: 'get', path: '/admin/stats', auth: 'admin', async handler() { return svc.adminStats(); } },
  ];
}

