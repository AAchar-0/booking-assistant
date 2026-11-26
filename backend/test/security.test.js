import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';
import { signToken, verifyToken } from '../src/auth/tokens.js';
import { createRateLimiter } from '../src/auth/rateLimit.js';
import { parse, v } from '../src/http/validate.js';
import { HttpError } from '../src/http/errors.js';
import { loadConfig } from '../src/config.js';
import { formatAccessLine } from '../src/http/accessLog.js';

test('passwords: right one verifies, wrong one does not, hashes are salted', async () => {
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('scrypt$'));
  assert.equal(await verifyPassword('correct horse battery', a), true);
  assert.equal(await verifyPassword('wrong password!!', a), false);
  assert.equal(await verifyPassword('anything', 'garbage'), false);
});

test('tokens: valid, expired, tampered, wrong secret and alg none', () => {
  const secret = 's'.repeat(40);
  const now = Date.parse('2026-11-26T00:00:00Z');
  const token = signToken({ sub: 7, role: 'ADMIN' }, secret, 60, now);
  assert.equal(verifyToken(token, secret, now + 30_000).sub, 7);
  assert.equal(verifyToken(token, secret, now + 61_000), null);                       // expired
  assert.equal(verifyToken(token, 'x'.repeat(40), now), null);                        // wrong secret
  const [h, p, s] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 7, role: 'ADMIN', exp: 9999999999 })).toString('base64url');
  assert.equal(verifyToken(`${h}.${forged}.${s}`, secret, now), null);                // payload changed
  const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  assert.equal(verifyToken(`${none}.${p}.`, secret, now), null);                      // "alg: none" trick
  assert.equal(verifyToken('not a token', secret, now), null);
});

test('rate limiter blocks after max hits and recovers after the window', () => {
  let t = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => t });
  assert.equal(limiter.hit('a').allowed, true);
  assert.equal(limiter.hit('a').allowed, true);
  const blocked = limiter.hit('a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
  assert.equal(limiter.hit('b').allowed, true);       // other keys are separate
  t = 1001;
  assert.equal(limiter.hit('a').allowed, true);
});

test('validation: cleans good input and reports every problem at once', () => {
  const schema = { email: v.email(), age: v.int({ min: 18 }), day: v.date(), note: v.string({ max: 5, optional: true }) };
  assert.deepEqual(parse(schema, { email: ' Ann@Example.COM ', age: '30', day: '2026-02-28', extra: 'dropped' }),
    { email: 'ann@example.com', age: 30, day: '2026-02-28' });
  try {
    parse(schema, { email: 'nope', age: 5, day: '2026-02-30', note: 'too long' });
    assert.fail('should throw');
  } catch (e) {
    assert.ok(e instanceof HttpError);
    assert.deepEqual(Object.keys(e.details).sort(), ['age', 'day', 'email', 'note']);
  }
  assert.throws(() => parse({ at: v.instant() }, { at: '2026-12-01T10:00:00' }));          // no time zone
  assert.equal(parse({ at: v.instant() }, { at: '2026-12-01T10:00:00+03:00' }).at, '2026-12-01T07:00:00.000Z');
  assert.throws(() => parse({ x: v.string({ min: 1 }) }, 'not an object'));
});

test('config: production refuses weak or missing secrets', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' }), /JWT_SECRET/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'short', DATABASE_URL: 'postgres://x' }), /JWT_SECRET/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }), /DATABASE_URL/);
  assert.throws(() => loadConfig({ BUSINESS_TZ: 'Mars/Olympus' }), /time zone/);
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
  assert.equal(loadConfig({}).business.timezone, 'Africa/Nairobi');
});

test('access log lines match the Log Analyzer format and hide personal data', () => {
  const line = formatAccessLine({ ip: undefined, userId: 5, date: new Date('2026-11-26T05:00:09Z'), method: 'GET',
    path: '/api/services?x=1 evil', status: 200, bytes: 512, millis: 7 });
  assert.equal(line, '- - 5 [26/Nov/2026:05:00:09 +0000] "GET /api/services?x=1_evil HTTP/1.1" 200 512 7');
  assert.match(line, /^- - - \[|^- - 5 \[/);
});
