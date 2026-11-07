import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestError, requestJson } from './api';

async function withFetch(fake: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fake;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('only a request that got no response at all is reported as a network failure', async () => {
  await withFetch((async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch, async () => {
    await assert.rejects(requestJson('/api/health'), (error) => error instanceof RequestError && error.code === 'NETWORK');
  });
  await withFetch((async () => new Response('<html>Bad Gateway</html>', { status: 502 })) as typeof fetch, async () => {
    await assert.rejects(requestJson('/api/investigate'), (error) => error instanceof RequestError && error.code === null && error.status === 502);
  });
  await withFetch((async () => Response.json({ error: 'Slow down.', code: 'RESEARCH_RATE_LIMITED' }, { status: 429 })) as typeof fetch, async () => {
    await assert.rejects(requestJson('/api/investigate'), (error) => error instanceof RequestError && error.code === 'RESEARCH_RATE_LIMITED');
  });
});

test('a request the user cancelled stays a cancellation, not a network failure', async () => {
  const controller = new AbortController();
  controller.abort();
  await withFetch((async () => { throw new DOMException('aborted', 'AbortError'); }) as typeof fetch, async () => {
    await assert.rejects(requestJson('/api/investigate', { signal: controller.signal }), (error) => error instanceof DOMException && error.name === 'AbortError');
  });
});
