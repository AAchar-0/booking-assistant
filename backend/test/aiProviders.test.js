import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, TOMORROW } from '../testkit/world.js';
import { createAssistant } from '../src/ai/assistant.js';
import { loadConfig } from '../src/config.js';
import { toolDefinitions } from '../src/ai/tools.js';
import {
  createOpenAICompatClient, toOpenAIMessages, toOpenAITools, fromOpenAIResponse,
} from '../src/ai/openaiCompatClient.js';

const SECRET = 'sk-test-SECRET-KEY-1234567890';

// A stand-in for the provider's web server: replies are prepared, and every request is recorded.
function fakeFetch(replies) {
  const calls = [];
  let i = 0;
  const impl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const reply = replies[i++];
    if (reply instanceof Error) throw reply;
    return { ok: reply.status === undefined || reply.status < 400, status: reply.status ?? 200, json: async () => reply.json };
  };
  impl.calls = calls;
  return impl;
}
const say = (text) => ({ json: { choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }] } });
const call = (id, name, args) => ({ json: { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] } });

// ---------------------------------------------------------------- translation
test('tools are wrapped as functions and unsupported schema keywords are removed', () => {
  const out = toOpenAITools(toolDefinitions);
  assert.equal(out.length, 5);
  assert.equal(out[1].type, 'function');
  assert.equal(out[1].function.name, 'get_availability');
  assert.deepEqual(out[1].function.parameters.required, ['service_id', 'date']);
  assert.ok(!JSON.stringify(out).includes('additionalProperties'));
});

test('conversation history is translated: system first, tool_use becomes tool_calls, tool_result becomes a tool message', () => {
  const messages = [
    { role: 'user', content: 'Book me a follow-up' },
    { role: 'assistant', content: [{ type: 'text', text: 'Let me look.' }, { type: 'tool_use', id: 'c1', name: 'list_services', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: '[{"id":1}]' }] },
  ];
  const out = toOpenAIMessages('SYSTEM TEXT', messages);
  assert.deepEqual(out[0], { role: 'system', content: 'SYSTEM TEXT' });
  assert.deepEqual(out[1], { role: 'user', content: 'Book me a follow-up' });
  assert.equal(out[2].role, 'assistant');
  assert.equal(out[2].content, 'Let me look.');
  assert.deepEqual(out[2].tool_calls, [{ id: 'c1', type: 'function', function: { name: 'list_services', arguments: '{}' } }]);
  assert.deepEqual(out[3], { role: 'tool', tool_call_id: 'c1', content: '[{"id":1}]' });
});

test('an assistant turn with only tool calls has empty (null) text, as the format requires', () => {
  const out = toOpenAIMessages('S', [{ role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'list_services', input: {} }] }]);
  assert.equal(out[1].content, null);
});

test('provider answers are turned back into text and tool_use blocks', () => {
  assert.deepEqual(fromOpenAIResponse(say('Hello').json), { content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn' });
  const tool = fromOpenAIResponse(call('abc', 'get_availability', { service_id: 2, date: '2026-11-27' }).json);
  assert.equal(tool.stop_reason, 'tool_use');
  assert.deepEqual(tool.content, [{ type: 'tool_use', id: 'abc', name: 'get_availability', input: { service_id: 2, date: '2026-11-27' } }]);
});

test('broken tool arguments become an empty input, and a missing call id gets a generated one', () => {
  const data = { choices: [{ message: { content: '', tool_calls: [{ type: 'function', function: { name: 'list_services', arguments: '{not json' } }] } }] };
  const out = fromOpenAIResponse(data);
  assert.deepEqual(out.content[0].input, {});
  assert.match(out.content[0].id, /^call_[0-9a-f]{8}$/);
  const array = { choices: [{ message: { tool_calls: [{ id: 'z', function: { name: 'n', arguments: '[1,2]' } }] } }] };
  assert.deepEqual(fromOpenAIResponse(array).content[0].input, {});
});

test('an unexpected answer shape is an error, not a crash', () => {
  assert.throws(() => fromOpenAIResponse({}), /unexpected response shape/);
  assert.throws(() => fromOpenAIResponse({ choices: [] }), /unexpected response shape/);
});

// ---------------------------------------------------------------- the client
test('the client posts to the right address with the key only in the Authorization header', async () => {
  const f = fakeFetch([say('ok')]);
  const client = createOpenAICompatClient({ apiKey: SECRET, model: 'm-1', baseUrl: 'https://api.example.test/openai/v1/', fetchImpl: f });
  const out = await client.createMessage({ system: 'S', messages: [{ role: 'user', content: 'hi' }], tools: toolDefinitions });
  assert.equal(out.stop_reason, 'end_turn');
  const sent = f.calls[0];
  assert.equal(sent.url, 'https://api.example.test/openai/v1/chat/completions');
  assert.equal(sent.init.headers.authorization, `Bearer ${SECRET}`);
  assert.ok(!sent.init.body.includes(SECRET), 'the key must not be inside the request body');
  assert.equal(sent.body.model, 'm-1');
  assert.equal(sent.body.max_tokens, 1200);
  assert.equal(sent.body.reasoning_effort, undefined);
  assert.equal(sent.body.messages[0].role, 'system');
});

test('reasoning_effort is sent only when configured', async () => {
  const f = fakeFetch([say('ok')]);
  const client = createOpenAICompatClient({ apiKey: SECRET, model: 'm', baseUrl: 'https://x.test/v1', reasoningEffort: 'low', fetchImpl: f });
  await client.createMessage({ system: 'S', messages: [{ role: 'user', content: 'hi' }], tools: [] });
  assert.equal(f.calls[0].body.reasoning_effort, 'low');
});

test('errors mention the status or the failure type but never the key or the provider body', async () => {
  const limited = createOpenAICompatClient({ apiKey: SECRET, model: 'm', baseUrl: 'https://x.test/v1', fetchImpl: fakeFetch([{ status: 429, json: { error: SECRET } }]) });
  await assert.rejects(limited.createMessage({ system: 'S', messages: [], tools: [] }), (e) => {
    assert.match(e.message, /429/);
    assert.ok(!e.message.includes(SECRET));
    return true;
  });
  const down = createOpenAICompatClient({ apiKey: SECRET, model: 'm', baseUrl: 'https://x.test/v1', fetchImpl: fakeFetch([new TypeError(`fetch failed ${SECRET}`)]) });
  await assert.rejects(down.createMessage({ system: 'S', messages: [], tools: [] }), (e) => {
    assert.match(e.message, /request failed: TypeError/);
    assert.ok(!e.message.includes(SECRET));
    return true;
  });
});

// ---------------------------------------------------------------- the whole assistant through the adapter
test('the assistant works end to end through the adapter, and still books nothing by itself', async () => {
  const w = await makeWorld();
  const user = await w.makeUser();
  const follow = w.byName['Follow-up'];
  const startsAt = w.at(TOMORROW, '10:00');
  const f = fakeFetch([
    call('c1', 'list_services', {}),
    call('c2', 'get_availability', { service_id: follow.id, date: TOMORROW }),
    call('c3', 'propose_booking', { service_id: follow.id, starts_at: startsAt }),
    say('I have a Follow-up tomorrow at 10:00. Please press Confirm.'),
  ]);
  const client = createOpenAICompatClient({ apiKey: SECRET, model: 'm', baseUrl: 'https://x.test/v1', fetchImpl: f });
  const assistant = createAssistant({ client, svc: w.svc, config: w.config, clock: w.clock });
  const out = await assistant.chat({ user, messages: [{ role: 'user', content: 'Book a follow-up tomorrow at 10' }] });
  assert.match(out.reply, /press Confirm/);
  assert.equal(out.proposals.length, 1);
  assert.equal(out.proposals[0].startsAt, startsAt);
  assert.equal((await w.svc.listMyBookings(user)).length, 0);                       // NOTHING was booked

  // The provider received tool results as role "tool" messages, matched to the call ids it chose.
  const lastRequest = f.calls[3].body.messages;
  const toolMessages = lastRequest.filter((m) => m.role === 'tool');
  assert.deepEqual(toolMessages.map((m) => m.tool_call_id), ['c1', 'c2', 'c3']);
  assert.match(toolMessages[2].content, /PROPOSED_NOT_BOOKED/);
  // Only read and propose tools were ever offered.
  const offered = f.calls[0].body.tools.map((t) => t.function.name).sort();
  assert.deepEqual(offered, ['get_availability', 'list_my_bookings', 'list_services', 'propose_booking', 'propose_cancellation']);
});

test('a provider failure reaches the customer as a friendly message, without details', async () => {
  const w = await makeWorld();
  const client = createOpenAICompatClient({ apiKey: SECRET, model: 'm', baseUrl: 'https://x.test/v1', fetchImpl: fakeFetch([{ status: 401, json: {} }]) });
  const assistant = createAssistant({ client, svc: w.svc, config: w.config, clock: w.clock });
  await assert.rejects(assistant.chat({ user: await w.makeUser(), messages: [{ role: 'user', content: 'hi' }] }),
    (e) => e.status === 502 && !JSON.stringify(e.message).includes(SECRET) && /unavailable/.test(e.message));
});

// ---------------------------------------------------------------- settings
test('settings: the default is still Anthropic and nothing changes for it', () => {
  const c = loadConfig({ ANTHROPIC_API_KEY: 'a-key' });
  assert.equal(c.ai.provider, 'anthropic');
  assert.equal(c.ai.apiKey, 'a-key');
  assert.equal(c.ai.model, 'claude-haiku-5-5');
});

test('settings: the groq preset fills in the address and a model, and reads AI_API_KEY', () => {
  const c = loadConfig({ AI_PROVIDER: 'groq', AI_API_KEY: 'g-key', ANTHROPIC_API_KEY: 'ignored' });
  assert.equal(c.ai.apiKey, 'g-key');
  assert.equal(c.ai.baseUrl, 'https://api.groq.com/openai/v1');
  assert.equal(c.ai.model, 'llama-3.3-70b-versatile');
  assert.equal(loadConfig({ AI_PROVIDER: 'groq' }).ai.apiKey, '', 'without AI_API_KEY the assistant stays off');
});

test('settings: wrong provider names, plain http addresses, missing models and odd effort values are refused at start', () => {
  assert.throws(() => loadConfig({ AI_PROVIDER: 'grok' }), /AI_PROVIDER must be one of/);
  assert.throws(() => loadConfig({ AI_PROVIDER: 'openai-compatible', AI_API_KEY: 'k', AI_MODEL: 'm', AI_BASE_URL: 'http://insecure.test/v1' }), /must start with https/);
  assert.throws(() => loadConfig({ AI_PROVIDER: 'openai-compatible', AI_API_KEY: 'k', AI_BASE_URL: 'https://x.test/v1' }), /AI_MODEL must be set/);
  assert.throws(() => loadConfig({ AI_PROVIDER: 'groq', AI_API_KEY: 'k', AI_REASONING_EFFORT: 'extreme' }), /low, medium or high/);
  const ok = loadConfig({ AI_PROVIDER: 'openai-compatible', AI_API_KEY: 'k', AI_MODEL: 'm', AI_BASE_URL: 'https://x.test/v1/' });
  assert.equal(ok.ai.baseUrl, 'https://x.test/v1');
});
