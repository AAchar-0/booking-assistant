// Minimal client for the Anthropic Messages API (plain fetch, no SDK).
// Kept tiny and replaceable: the assistant only needs `createMessage`, so tests pass in a scripted fake instead.
export class AssistantError extends Error {}

export function createAnthropicClient({ apiKey, model, maxTokens = 700, timeoutMs = 25_000, fetchImpl = fetch }) {
  return {
    async createMessage({ system, messages, tools }) {
      let response;
      try {
        response = await fetchImpl('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, tools }),
          signal: AbortSignal.timeout(timeoutMs),               // never wait forever on a slow API
        });
      } catch (e) {
        throw new AssistantError(`request failed: ${e.name}`);
      }
      if (!response.ok) throw new AssistantError(`API answered ${response.status}`);   // details stay in the server log
      return response.json();
    },
  };
}
