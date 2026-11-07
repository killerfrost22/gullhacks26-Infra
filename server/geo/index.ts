import type { Coordinates, LocationContext, Place } from '../../shared/types.js';
import { ApiError } from '../errors.js';
import { CensusClient } from './census.js';
import { ContextService } from './context.js';
import { NominatimClient } from './nominatim.js';
import { OverpassClient } from './overpass.js';
import { type Clock, realClock, withTimeout } from './support.js';

/** Search and reverse lookups give up after this, counting time spent in the one-per-second queue. */
const GEOCODER_DEADLINE_MS = 10_000;
const GEOCODER_DOWN = 'The address lookup is not responding right now. Try again in a minute.';

export interface GeoService {
  searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]>;
  reversePlace(point: Coordinates, signal?: AbortSignal): Promise<Place | null>;
  getLocationContext(point: Coordinates, signal?: AbortSignal): Promise<LocationContext>;
}

export interface GeoOptions {
  clock?: Clock;
  /** Read at call time, so values `dotenv` loads after import still apply. */
  env?: NodeJS.ProcessEnv;
}

/** Each service owns its caches, Overpass backoff, and Nominatim queue. The app uses one; tests make fresh ones. */
export function createGeoService({ clock = realClock, env = process.env }: GeoOptions = {}): GeoService {
  const nominatim = new NominatimClient(clock, env);
  const context = new ContextService(nominatim, new OverpassClient(clock, env), new CensusClient(clock, env));

  async function geocode<T>(work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    try {
      return await work(withTimeout(signal, GEOCODER_DEADLINE_MS));
    } catch {
      if (signal?.aborted) throw signal.reason;
      throw new ApiError(502, GEOCODER_DOWN, 'GEOCODER_UNAVAILABLE');
    }
  }

  return {
    searchPlaces: (query, signal) => geocode((deadline) => nominatim.search(query, deadline), signal),
    reversePlace: (point, signal) =>
      geocode(async (deadline) => {
        const details = await nominatim.reverse(point, deadline);
        if (!details.label) return null;
        return { latitude: point.latitude, longitude: point.longitude, label: details.label, address: details.address };
      }, signal),
    getLocationContext: (point, signal) => context.get(point, signal),
  };
}

const service = createGeoService();

/** Up to 5 places for a free-text query. Throws `ApiError` `GEOCODER_UNAVAILABLE` when Nominatim fails. */
export function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  return service.searchPlaces(query, signal);
}

/** Address for a pin, or `null` when the geocoder has none. Throws `ApiError` `GEOCODER_UNAVAILABLE`. */
export function reversePlace(point: Coordinates, signal?: AbortSignal): Promise<Place | null> {
  return service.reversePlace(point, signal);
}

/** Map facts for a pin. Never throws for provider failures; sets `partial` instead. Rejects only if `signal` aborts. */
export function getLocationContext(point: Coordinates, signal?: AbortSignal): Promise<LocationContext> {
  return service.getLocationContext(point, signal);
}
