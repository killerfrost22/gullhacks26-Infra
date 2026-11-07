import type { Coordinates } from '../../shared/types.js';

export const DEFAULT_USER_AGENT = 'FixPlease/2.0 (local development)';

/** Time source for queues, caches, and backoff. Tests swap in a virtual clock so spacing is checked without waiting. */
export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  // `Promise.withResolvers` is ES2024; tsconfig targets ES2023 lib, so these use the executor form.
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    }),
};

/** ~11 m grid: close enough that two taps on the same spot share one lookup. */
export function pointKey(point: Coordinates): string {
  return `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`;
}

export class TtlCache<V> {
  readonly #entries = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly clock: Clock,
    private readonly maxEntries = 1000,
  ) {}

  get(key: string): { value: V } | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.clock.now()) {
      this.#entries.delete(key);
      return undefined;
    }
    return { value: entry.value };
  }

  set(key: string, value: V): void {
    this.#entries.delete(key);
    // Map keeps insertion order, so the first key is the oldest write.
    if (this.#entries.size >= this.maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
    this.#entries.set(key, { value, expires: this.clock.now() + this.ttlMs });
  }
}

interface Waiter {
  run: () => void;
  signal?: AbortSignal;
}

/**
 * Runs tasks one at a time, starting each at least `intervalMs` after the previous one started.
 * Nominatim's usage policy allows at most one request per second from the whole app, so every
 * search, reverse lookup, and fallback shares one limiter. A caller that aborts while waiting
 * leaves the queue without using a slot.
 */
export class RateLimiter {
  readonly #queue: Waiter[] = [];
  #lastStart = Number.NEGATIVE_INFINITY;
  #pumping = false;

  constructor(
    private readonly intervalMs: number,
    private readonly clock: Clock,
  ) {}

  schedule<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        const index = this.#queue.indexOf(waiter);
        if (index >= 0) this.#queue.splice(index, 1);
        reject(signal?.reason);
      };
      const waiter: Waiter = {
        signal,
        run: () => {
          signal?.removeEventListener('abort', onAbort);
          if (settled) return;
          settled = true;
          task().then(resolve, reject);
        },
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.#queue.push(waiter);
      void this.#pump();
    });
  }

  async #pump(): Promise<void> {
    if (this.#pumping) return;
    this.#pumping = true;
    try {
      while (this.#queue.length > 0) {
        const wait = this.#lastStart + this.intervalMs - this.clock.now();
        if (wait > 0) {
          await this.clock.sleep(wait);
          continue; // the head may have aborted while we slept
        }
        const next = this.#queue.shift();
        if (!next || next.signal?.aborted) continue;
        this.#lastStart = this.clock.now();
        next.run();
      }
    } finally {
      this.#pumping = false;
    }
  }
}

/** Joins the caller's signal with a deadline. */
export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** A provider answered badly or not at all. Never shown to users; callers map it to a plain message. */
export class ProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

export interface JsonRequest {
  signal: AbortSignal;
  userAgent: string;
  method?: 'GET' | 'POST';
  body?: string;
  contentType?: string;
}

export async function fetchJson(url: string, request: JsonRequest): Promise<unknown> {
  const headers: Record<string, string> = { 'User-Agent': request.userAgent, Accept: 'application/json' };
  if (request.contentType) headers['Content-Type'] = request.contentType;
  let response: Response;
  try {
    response = await fetch(url, { method: request.method ?? 'GET', headers, body: request.body, signal: request.signal });
  } catch (error) {
    throw new ProviderError(`request to ${new URL(url).host} failed`, { cause: error });
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderError(`${new URL(url).host} answered HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new ProviderError(`${new URL(url).host} sent unreadable JSON`, { cause: error });
  }
}

export function userAgentFrom(env: NodeJS.ProcessEnv): string {
  return env.GEOCODER_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

export function baseUrlFrom(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/, '');
}

/** Planar distance in meters; accurate to well under a meter at the ~100 m scale used here. */
export function makeProjector(origin: Coordinates): (lat: number, lon: number) => { x: number; y: number } {
  const metersPerDegree = 111_320;
  const cosLat = Math.cos((origin.latitude * Math.PI) / 180);
  return (lat, lon) => ({
    x: (lon - origin.longitude) * metersPerDegree * cosLat,
    y: (lat - origin.latitude) * metersPerDegree,
  });
}

export function stringTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** OSM websites are often mapped without a scheme (`www.umd.edu`). Anything that isn't a plain web URL is dropped. */
export function normalizeWebsite(value: unknown): string | null {
  const text = stringTag(value);
  if (!text) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}
