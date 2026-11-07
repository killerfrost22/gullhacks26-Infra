import { z } from 'zod';
import type { CampusFact, Coordinates, Place, PlaceAddress } from '../../shared/types.js';
import {
  type Clock,
  ProviderError,
  RateLimiter,
  TtlCache,
  baseUrlFrom,
  fetchJson,
  normalizeWebsite,
  pointKey,
  stringTag,
  userAgentFrom,
  withTimeout,
} from './support.js';

const DEFAULT_BASE_URL = 'https://nominatim.openstreetmap.org';
const REQUEST_TIMEOUT_MS = 8_000;
const SEARCH_TTL_MS = 5 * 60_000;
const REVERSE_TTL_MS = 15 * 60_000;
const SEARCH_LIMIT = 5;

const Tags = z.record(z.string(), z.unknown());

const NominatimResult = z.object({
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  name: z.unknown().optional(),
  display_name: z.unknown().optional(),
  category: z.unknown().optional(),
  type: z.unknown().optional(),
  address: Tags.nullish().catch(null),
  extratags: Tags.nullish().catch(null),
});
type NominatimResult = z.infer<typeof NominatimResult>;

/** What one reverse lookup tells us. `label: null` means the geocoder has no usable address here. */
export interface ReverseDetails {
  label: string | null;
  address: PlaceAddress | null;
  /** Set only when the object at the pin is itself a mapped university or college. */
  campus: CampusFact | null;
}

const NO_ADDRESS: ReverseDetails = { label: null, address: null, campus: null };

export function toPlaceAddress(raw: Record<string, unknown> | null | undefined): PlaceAddress | null {
  if (!raw) return null;
  const address: PlaceAddress = {
    houseNumber: stringTag(raw.house_number),
    road: stringTag(raw.road),
    locality: stringTag(raw.city) ?? stringTag(raw.town) ?? stringTag(raw.village) ?? stringTag(raw.hamlet),
    county: stringTag(raw.county),
    state: stringTag(raw.state),
    postcode: stringTag(raw.postcode),
    country: stringTag(raw.country),
    countryCode: stringTag(raw.country_code)?.toLowerCase() ?? null,
  };
  return Object.values(address).some((value) => value !== null) ? address : null;
}

/** Decimal degrees (`38.9897`) or DMS (`38°59'`): a label must never show the user raw coordinates. */
function looksLikeCoordinates(text: string): boolean {
  return /[-+]?\d{1,3}\.\d{3,}/.test(text) || /\d\s*°/.test(text);
}

function joinParts(parts: Array<string | null>): string | null {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    if (!part || looksLikeCoordinates(part)) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(part);
  }
  return kept.length > 0 ? kept.join(', ') : null;
}

/** First few named segments of `display_name`, without bare numbers (house numbers, postcodes) or coordinates. */
function trimDisplayName(value: unknown): string | null {
  const text = stringTag(value);
  if (!text) return null;
  const segments = text
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '' && !/^\d+$/.test(segment) && !looksLikeCoordinates(segment));
  return joinParts(segments.slice(0, 3));
}

/**
 * "4306 Campus Drive, College Park, Maryland" from the address parts that exist. A house number without a road
 * is dropped rather than shown alone, and a missing part is skipped, never filled in.
 */
export function buildLabel(name: unknown, address: PlaceAddress | null, displayName: unknown): string | null {
  const road = address?.road ?? null;
  const street = road ? (address?.houseNumber ? `${address.houseNumber} ${road}` : road) : null;
  const area = address?.locality ?? address?.county ?? null;
  let placeName = stringTag(name);
  if (placeName && [road, area].some((part) => part?.toLowerCase() === placeName?.toLowerCase())) placeName = null;
  if (placeName || street || area) return joinParts([placeName, street, area, address?.state ?? null]);
  return trimDisplayName(displayName);
}

function campusFrom(result: NominatimResult, address: Record<string, unknown> | null | undefined): CampusFact | null {
  if (result.category !== 'amenity' || (result.type !== 'university' && result.type !== 'college')) return null;
  const name = stringTag(result.name) ?? stringTag(address?.amenity);
  if (!name) return null;
  const tags = result.extratags ?? {};
  return {
    name,
    operator: stringTag(tags.operator),
    website: normalizeWebsite(tags.website) ?? normalizeWebsite(tags['contact:website']),
  };
}

export function toReverseDetails(body: unknown): ReverseDetails {
  if (typeof body === 'object' && body !== null && 'error' in body) return NO_ADDRESS;
  const parsed = NominatimResult.safeParse(body);
  if (!parsed.success) throw new ProviderError('Nominatim reverse answer had an unexpected shape');
  const result = parsed.data;
  const address = toPlaceAddress(result.address);
  return {
    label: buildLabel(result.name, address, result.display_name),
    address,
    campus: campusFrom(result, result.address),
  };
}

export function toPlaces(body: unknown): Place[] {
  if (!Array.isArray(body)) throw new ProviderError('Nominatim search answer was not a list');
  const places: Place[] = [];
  for (const item of body) {
    const parsed = NominatimResult.safeParse(item);
    if (!parsed.success) continue;
    const { lat, lon } = parsed.data;
    if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const address = toPlaceAddress(parsed.data.address);
    const label = buildLabel(parsed.data.name, address, parsed.data.display_name);
    if (!label) continue;
    places.push({ latitude: lat, longitude: lon, label, address });
    if (places.length === SEARCH_LIMIT) break;
  }
  return places;
}

export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

export class NominatimClient {
  readonly #limiter: RateLimiter;
  readonly #searchCache: TtlCache<Place[]>;
  readonly #reverseCache: TtlCache<ReverseDetails>;

  constructor(
    clock: Clock,
    private readonly env: NodeJS.ProcessEnv,
  ) {
    this.#limiter = new RateLimiter(1_000, clock);
    this.#searchCache = new TtlCache(SEARCH_TTL_MS, clock);
    this.#reverseCache = new TtlCache(REVERSE_TTL_MS, clock);
  }

  /** Throws `ProviderError` on provider failure, or the signal's reason when aborted. */
  async search(query: string, signal?: AbortSignal): Promise<Place[]> {
    const key = normalizeQuery(query);
    const cached = this.#searchCache.get(key);
    if (cached) return cached.value;
    const params = new URLSearchParams({ q: query.trim(), format: 'jsonv2', addressdetails: '1', limit: String(SEARCH_LIMIT) });
    const places = toPlaces(await this.#request('search', params, signal));
    this.#searchCache.set(key, places);
    return places;
  }

  /** Throws `ProviderError` on provider failure, or the signal's reason when aborted. */
  async reverse(point: Coordinates, signal?: AbortSignal): Promise<ReverseDetails> {
    const key = pointKey(point);
    const cached = this.#reverseCache.get(key);
    if (cached) return cached.value;
    const params = new URLSearchParams({
      lat: point.latitude.toFixed(6),
      lon: point.longitude.toFixed(6),
      format: 'jsonv2',
      zoom: '18',
      addressdetails: '1',
      // Website and operator, for when the pin sits on a mapped campus and Overpass is down.
      extratags: '1',
    });
    const details = toReverseDetails(await this.#request('reverse', params, signal));
    this.#reverseCache.set(key, details);
    return details;
  }

  #request(path: 'search' | 'reverse', params: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
    const url = `${baseUrlFrom(this.env.NOMINATIM_BASE_URL, DEFAULT_BASE_URL)}/${path}?${params}`;
    const userAgent = userAgentFrom(this.env);
    return this.#limiter.schedule(
      () => fetchJson(url, { signal: withTimeout(signal, REQUEST_TIMEOUT_MS), userAgent }),
      signal,
    );
  }
}
