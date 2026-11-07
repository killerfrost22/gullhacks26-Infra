import { setTimeout as delay } from 'node:timers/promises';
import type { LocationResult } from '../shared/types.js';
import { ApiError } from './errors.js';
import { locationSchema } from './validation.js';

let queueTail: Promise<void> = Promise.resolve();
let pending = 0;
let lastStartedAt = 0;

/** Every Nominatim request, from any endpoint, shares this one-per-second gate. */
export async function nominatim(path: string, params: URLSearchParams, signal: AbortSignal): Promise<unknown> {
  if (pending >= 20) throw new ApiError(429, 'Location lookup is busy. Please try again shortly.', 'GEOCODER_BUSY');
  pending += 1;
  const previous = queueTail;
  let release!: () => void;
  queueTail = new Promise<void>((resolve) => { release = resolve; });
  try {
    await previous;
    signal.throwIfAborted();
    const wait = Math.max(0, lastStartedAt + 1100 - Date.now());
    if (wait) await delay(wait, undefined, { signal });
    signal.throwIfAborted();
    const base = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
    const url = new URL(path, `${base.replace(/\/$/, '')}/`);
    url.search = params.toString();
    lastStartedAt = Date.now();
    const upstreamSignal = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
    const response = await fetch(url, {
      headers: {
        'User-Agent': process.env.GEOCODER_USER_AGENT || 'FixPlease/1.0 (local development)',
        Accept: 'application/json',
      },
      signal: upstreamSignal,
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError(response.status === 429 ? 429 : 502,
        response.status === 429 ? 'The location provider is rate limited. Please wait before trying again.' : 'The location provider could not complete this lookup.',
        'GEOCODER_UNAVAILABLE');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ApiError(502, 'The location provider returned an empty response.', 'GEOCODER_UNAVAILABLE');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 512_000) {
        await reader.cancel();
        throw new ApiError(502, 'The location provider returned an oversized response.', 'GEOCODER_UNAVAILABLE');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (signal.aborted || error instanceof ApiError) throw error;
    throw new ApiError(502, 'Location lookup failed or timed out. Please try again later.', 'GEOCODER_UNAVAILABLE');
  } finally {
    pending -= 1;
    release();
  }
}

function addressText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}

function parsePlace(input: unknown): LocationResult | null {
  if (!input || typeof input !== 'object') return null;
  const place = input as Record<string, unknown>;
  if (typeof place.lat !== 'string' || typeof place.lon !== 'string' || !place.lat.trim() || !place.lon.trim()) return null;
  const address = place.address && typeof place.address === 'object' && !Array.isArray(place.address)
    ? place.address as Record<string, unknown>
    : null;
  const street = addressText(address?.road) ?? addressText(address?.pedestrian)
    ?? addressText(address?.footway) ?? addressText(address?.path);
  // An explicit settlement is more specific than a city-level municipal boundary.
  const city = addressText(address?.town) ?? addressText(address?.village) ?? addressText(address?.hamlet)
    ?? addressText(address?.city) ?? addressText(address?.municipality);
  const houseNumber = addressText(address?.house_number);
  const parsed = locationSchema.safeParse({
    latitude: Number(place.lat), longitude: Number(place.lon), label: place.display_name,
    address: street || city || houseNumber ? { street, city, houseNumber } : null,
  });
  return parsed.success ? parsed.data : null;
}

export async function searchLocations(query: unknown, signal: AbortSignal): Promise<LocationResult[]> {
  if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 300) {
    throw new ApiError(400, 'Enter a location between 2 and 300 characters.', 'INVALID_QUERY');
  }
  const data = await nominatim('search', new URLSearchParams({ q: query.trim(), format: 'jsonv2', addressdetails: '1', limit: '6' }), signal);
  if (!Array.isArray(data)) throw new ApiError(502, 'The location provider returned an invalid response.', 'GEOCODER_UNAVAILABLE');
  return data.map(parsePlace).filter((place): place is LocationResult => place !== null).slice(0, 6);
}

export async function reverseLocation(latitude: number, longitude: number, signal: AbortSignal): Promise<LocationResult> {
  const data = await nominatim('reverse', new URLSearchParams({ lat: String(latitude), lon: String(longitude), format: 'jsonv2', addressdetails: '1', zoom: '18' }), signal);
  const place = parsePlace(data);
  if (!place) throw new ApiError(404, 'No mapped address was found here. You can still use the selected coordinates.', 'LOCATION_NOT_FOUND');
  // Reverse-geocoder centroids must not silently move the user's chosen point.
  return { ...place, latitude, longitude };
}
