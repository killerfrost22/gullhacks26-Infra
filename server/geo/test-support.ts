// Offline helpers for the geo tests. Not a test file itself.
import type { Clock } from './support.js';

export interface VirtualClock extends Clock {
  advance(ms: number): void;
}

/** Time only moves when code sleeps or a test advances it, so spacing checks run instantly. */
export function virtualClock(start = 1_700_000_000_000): VirtualClock {
  let now = start;
  return {
    now: () => now,
    sleep: async (ms, signal) => {
      signal?.throwIfAborted();
      now += ms;
    },
    advance: (ms) => {
      now += ms;
    },
  };
}

export interface FetchCall {
  url: URL;
  init: RequestInit;
  /** Virtual time when the request left, if a clock was given. */
  at: number | null;
}

/** `'hang'` never answers; it rejects when the request's signal aborts. */
export type FakeAnswer = Response | 'hang';

export const geoEnv: NodeJS.ProcessEnv = {
  NOMINATIM_BASE_URL: 'https://nominatim.invalid',
  OVERPASS_URL: 'https://overpass.invalid/api/interpreter',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Replaces `globalThis.fetch` until `restore()`. */
export function installFetch(handler: (url: URL, init: RequestInit) => FakeAnswer | Promise<FakeAnswer>, clock?: Clock) {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push({ url, init, at: clock ? clock.now() : null });
    init.signal?.throwIfAborted();
    const answer = await handler(url, init);
    if (answer !== 'hang') return answer;
    return new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
  }) as typeof fetch;
  return {
    calls,
    count: (host: string) => calls.filter((call) => call.url.hostname === host).length,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

export const NOMINATIM_HOST = 'nominatim.invalid';
export const OVERPASS_HOST = 'overpass.invalid';
export const CENSUS_HOST = 'geocoding.geo.census.gov';

/** A promise plus its resolver (`Promise.withResolvers` is ES2024; the project's lib is ES2023). */
export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
