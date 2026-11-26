// Client for any service that speaks the "OpenAI-compatible" chat format (Groq, OpenRouter, Gemini's compatibility
// endpoint, a local server, and so on). It exists so the assistant does not depend on one company.
//
// The assistant (assistant.js) talks in the Anthropic message shape: content blocks of type text, tool_use and
// tool_result. This file translates that shape to the OpenAI-compatible shape and back, so assistant.js and
// tools.js stay exactly as they are and all of their safety rules keep applying:
//   Anthropic "tool_use" block   <->  OpenAI assistant message with "tool_calls"
//   Anthropic "tool_result" block <->  OpenAI message with role "tool"
//
// Security notes: the API key is sent only in the Authorization header and never appears in an error message or a log
// line; only the HTTP status is reported. The base URL comes from the server's own environment (never from a visitor)
// and config.js insists on https.
import { randomUUID } from 'node:crypto';
import { AssistantError } from './anthropicClient.js';

// Some providers reject JSON-Schema keywords they do not know, and "additionalProperties" is the usual culprit.
// The server validates every tool input itself (tools.js), so dropping the keyword here loses no safety.
function cleanSchema(schema) {
  if (Array.isArray(schema)) return schema.map(cleanSchema);
  if (schema && typeof schema === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(schema)) {
      if (key === 'additionalProperties') continue;
      out[key] = cleanSchema(value);
    }
    return out;
  }
  return schema;
}

export function toOpenAITools(tools = []) {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: cleanSchema(t.input_schema) },
  }));
}

export function toOpenAIMessages(system, messages) {
  const out = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (typeof m.content === 'string') { out.push({ role: m.role, content: m.content }); continue; }
    const blocks = Array.isArray(m.content) ? m.content : [];
    if (m.role === 'assistant') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const calls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({
        id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
      }));
      const message = { role: 'assistant', content: text || null };
      if (calls.length > 0) message.tool_calls = calls;
      out.push(message);
    } else {
      for (const b of blocks) {
        if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: String(b.content) });
      }
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      if (text) out.push({ role: 'user', content: text });
    }
  }
  return out;
}

// Turns the provider's answer into the block list that assistant.js understands.
export function fromOpenAIResponse(data) {
  const message = data?.choices?.[0]?.message;
  if (!message || typeof message !== 'object') throw new AssistantError('unexpected response shape');
  const content = [];
  if (typeof message.content === 'string' && message.content.trim()) content.push({ type: 'text', text: message.content });
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  for (const call of calls) {
    let input = {};
    try { input = JSON.parse(call?.function?.arguments || '{}'); } catch { input = {}; }   // bad JSON: tools.js will reject the empty input
    if (input === null || typeof input !== 'object' || Array.isArray(input)) input = {};
    content.push({ type: 'tool_use', id: call?.id || `call_${randomUUID().slice(0, 8)}`, name: String(call?.function?.name ?? ''), input });
  }
  return { content, stop_reason: calls.length > 0 ? 'tool_use' : 'end_turn' };
}

export function createOpenAICompatClient({
  apiKey, model, baseUrl, maxTokens = 1200, timeoutMs = 25_000, reasoningEffort = '', fetchImpl = fetch,
}) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  return {
    async createMessage({ system, messages, tools }) {
      const body = { model, max_tokens: maxTokens, messages: toOpenAIMessages(system, messages), tools: toOpenAITools(tools) };
      if (reasoningEffort) body.reasoning_effort = reasoningEffort;   // only some models understand it (for example gpt-oss)
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),               // never wait forever on a slow API
        });
      } catch (e) {
        throw new AssistantError(`request failed: ${e.name}`);
      }
      if (!response.ok) throw new AssistantError(`API answered ${response.status}`);   // never include the body: it may echo the request
      let data;
      try { data = await response.json(); } catch { throw new AssistantError('answer was not JSON'); }
      return fromOpenAIResponse(data);
    },
  };
}
