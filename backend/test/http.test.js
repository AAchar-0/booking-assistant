// End-to-end tests through real HTTP: a real Express app on a random port, an in-memory database,
// a fake clock and a scripted AI. Everything a browser would do, without the browser.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, TOMORROW } from '../testkit/world.js';
import { createApp } from '../src/app.js';
import { createAssistant } from '../src/ai/assistant.js';
import { hashPassword } from '../src/auth/passwords.js';

let world, server, base, logs, aiScript;

before(async () => {
  world = await makeWorld({ env: { ALLOWED_ORIGIN: 'https://site.example', AI_USER_HOURLY_LIMIT: '3' } });
  await world.repo.createUser({ email: 'admin@example.com', passwordHash: await hashPassword('admin password 123'), fullName: 'Admin', role: 'ADMIN' });
  logs = [];
  aiScript = [];
  const client = { async createMessage() { return aiScript.shift() ?? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }; } };
  const assistant = createAssistant({ client, svc: world.svc, config: world.config, clock: world.clock });
  const app = createApp({ repo: world.repo, svc: world.svc, assistant, config: world.config, clock: world.clock, logWrite: (l) => logs.push(l) });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

async function call(method, path, { body, token, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}
const register = async (email, name = 'Rita Customer') =>
  (await call('POST', '/auth/register', { body: { email, fullName: name, password: 'a long enough password' } })).json;

test('health, config and public catalogue work without logging in', async () => {
  assert.deepEqual((await call('GET', '/health')).json, { status: 'ok', database: 'memory', assistant: 'on' });
  const config = (await call('GET', '/config')).json;
  assert.equal(config.timezone, 'Africa/Nairobi');
  assert.equal(config.demoMode, true);
  const services = (await call('GET', '/services')).json.services;
  assert.equal(services.length, 4);
  const av = await call('GET', `/availability?serviceId=${services[0].id}&date=${TOMORROW}`);
  assert.equal(av.status, 200);
  assert.ok(av.json.slots.length > 10);
});

test('security headers, CORS for the allowed site only, and clean errors', async () => {
  const ok = await call('GET', '/services', { headers: { origin: 'https://site.example' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://site.example');
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(ok.headers.get('x-powered-by'), null);
  const evil = await call('GET', '/services', { headers: { origin: 'https://evil.example' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const preflight = await call('OPTIONS', '/bookings', { headers: { origin: 'https://site.example' } });
  assert.equal(preflight.status, 204);
  assert.equal((await call('GET', '/nope')).status, 404);
  const badJson = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(badJson.status, 400);
  const huge = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(30_000) }) });
  assert.equal(huge.status, 413);
});

test('register, log in, wrong password, duplicate email, weak password', async () => {
  const reg = await register('rita@example.com');
  assert.ok(reg.token);
  assert.equal(reg.user.role, 'CUSTOMER');
  assert.equal(reg.user.passwordHash, undefined);                                       // never sent to clients
  assert.equal((await call('POST', '/auth/register', { body: { email: 'RITA@example.com', fullName: 'x', password: 'a long enough password' } })).status, 409);
  const weak = await call('POST', '/auth/register', { body: { email: 'w@example.com', fullName: 'W', password: 'short' } });
  assert.equal(weak.status, 400);
  assert.ok(weak.json.error.details.password);
  assert.equal((await call('POST', '/auth/login', { body: { email: 'rita@example.com', password: 'a long enough password' } })).status, 200);
  const wrong = await call('POST', '/auth/login', { body: { email: 'rita@example.com', password: 'not the password' } });
  const unknown = await call('POST', '/auth/login', { body: { email: 'nobody@example.com', password: 'not the password' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.json, unknown.json);                                           // same answer: emails cannot be probed
});

test('login attempts are rate limited per IP and email', async () => {
  let last;
  for (let i = 0; i < 12; i++) last = await call('POST', '/auth/login', { body: { email: 'victim@example.com', password: 'guess number ' + i } });
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) >= 1);
});

test('the whole booking journey, and who may do what', async () => {
  const { token } = await register('journey@example.com');
  assert.equal((await call('GET', '/me')).status, 401);
  assert.equal((await call('POST', '/bookings', { body: {} })).status, 401);
  assert.equal((await call('GET', '/me', { token: 'forged.token.here' })).status, 401);

  const services = (await call('GET', '/services')).json.services;
  const follow = services.find((s) => s.name === 'Follow-up');
  const slots = (await call('GET', `/availability?serviceId=${follow.id}&date=${TOMORROW}`)).json.slots;
  const booked = await call('POST', '/bookings', { token, body: { serviceId: follow.id, startsAt: slots[0].startsAt, notes: 'first visit' } });
  assert.equal(booked.status, 201);
  assert.equal(booked.json.booking.status, 'CONFIRMED');
  assert.equal(booked.json.booking.local.time, '09:00');

  const mine = (await call('GET', '/bookings/mine', { token })).json.bookings;
  assert.equal(mine.length, 1);

  const bad = await call('POST', '/bookings', { token, body: { serviceId: 'abc', startsAt: 'tomorrow' } });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.json.error.details).sort(), ['serviceId', 'startsAt']);

  const stranger = await register('stranger@example.com');
  assert.equal((await call('POST', `/bookings/${mine[0].id}/cancel`, { token: stranger.token })).status, 404);   // not theirs
  assert.equal((await call('GET', '/admin/bookings', { token })).status, 403);                                  // customers are not admins

  const cancelled = await call('POST', `/bookings/${mine[0].id}/cancel`, { token });
  assert.equal(cancelled.json.booking.status, 'CANCELLED');
});

test('admin endpoints work for the admin account', async () => {
  const { token } = (await call('POST', '/auth/login', { body: { email: 'admin@example.com', password: 'admin password 123' } })).json;
  const created = await call('POST', '/admin/services', { token, body: { name: 'Express slot', durationMinutes: 10, priceCents: 50000 } });
  assert.equal(created.status, 201);
  assert.equal((await call('POST', '/admin/services', { token, body: { name: 'Odd', durationMinutes: 7, priceCents: 1 } })).status, 400);
  const patched = await call('PATCH', `/admin/services/${created.json.service.id}`, { token, body: { active: false } });
  assert.equal(patched.json.service.active, false);
  assert.equal((await call('GET', '/services')).json.services.some((s) => s.name === 'Express slot'), false);       // hidden from customers
  const list = await call('GET', `/admin/bookings?from=${TOMORROW}&to=${TOMORROW}`, { token });
  assert.equal(list.status, 200);
  assert.equal((await call('GET', '/admin/stats', { token })).status, 200);
});

test('assistant: needs login, returns proposals, is rate limited per user', async () => {
  assert.equal((await call('POST', '/assistant/chat', { body: { messages: [] } })).status, 401);
  const { token } = await register('chat@example.com');
  const follow = (await call('GET', '/services')).json.services.find((s) => s.name === 'Follow-up');
  const startsAt = (await call('GET', `/availability?serviceId=${follow.id}&date=${TOMORROW}`)).json.slots[1].startsAt;
  aiScript.push({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'p', name: 'propose_booking', input: { service_id: follow.id, starts_at: startsAt } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Please press Confirm.' }] });
  const out = await call('POST', '/assistant/chat', { token, body: { messages: [{ role: 'user', content: 'book follow-up tomorrow 9:15' }] } });
  assert.equal(out.status, 200);
  assert.equal(out.json.proposals[0].startsAt, startsAt);
  assert.equal((await call('GET', '/bookings/mine', { token })).json.bookings.length, 0);          // still nothing booked

  // The proposal is confirmed through the normal endpoint, marked as made via the assistant.
  const confirmed = await call('POST', '/bookings', { token, body: { serviceId: follow.id, startsAt, via: 'ASSISTANT' } });
  assert.equal(confirmed.json.booking.createdVia, 'ASSISTANT');

  await call('POST', '/assistant/chat', { token, body: { messages: [{ role: 'user', content: 'hi' }] } });
  await call('POST', '/assistant/chat', { token, body: { messages: [{ role: 'user', content: 'hi' }] } });
  assert.equal((await call('POST', '/assistant/chat', { token, body: { messages: [{ role: 'user', content: 'hi' }] } })).status, 429);
});

test('every request is written to the access log in the analyzer format, without personal data', async () => {
  assert.ok(logs.length > 20);
  const pattern = /^- - (\d+|-) \[\d{2}\/[A-Z][a-z]{2}\/\d{4}:\d{2}:\d{2}:\d{2} \+0000\] "[A-Z]+ \/api\/[\x21-\x7E]* HTTP\/1\.1" \d{3} (\d+|-) \d+$/;
  const bad = logs.filter((l) => !pattern.test(l));
  assert.deepEqual(bad, []);
  assert.ok(logs.every((l) => !l.includes('@') && !l.includes('?')));
});
