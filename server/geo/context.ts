import type { AreaFact, Coordinates, LocationContext, PlaceAddress } from '../../shared/types.js';
import type { CensusArea, CensusClient } from './census.js';
import type { NominatimClient } from './nominatim.js';
import type { OverpassClient } from './overpass.js';
import { withTimeout } from './support.js';

/** Upper bound for the whole lookup. Overpass (8 s) and Census (7 s) carry their own, shorter deadlines. */
const OVERALL_TIMEOUT_MS = 9_000;
/** Includes time spent waiting in the shared one-per-second Nominatim queue. */
const REVERSE_TIMEOUT_MS = 7_000;

type Outcome<T> = { ok: true; value: T } | { ok: false };

async function settle<T>(work: Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await work };
  } catch {
    return { ok: false };
  }
}

function areaFromAddress(address: PlaceAddress | null): AreaFact | null {
  if (!address) return null;
  const { locality, county, state, country, countryCode } = address;
  if (!locality && !county && !state && !country) return null;
  return { municipality: locality, municipalityKind: null, incorporation: 'unknown', county, state, country, countryCode };
}

function areaFromCensus(census: CensusArea, address: PlaceAddress | null): AreaFact {
  return {
    municipality: census.municipality,
    municipalityKind: census.municipalityKind,
    incorporation: census.incorporation,
    county: census.county ?? address?.county ?? null,
    state: census.state ?? address?.state ?? null,
    // Census only answers inside the U.S. and its territories; the geocoder names territories more precisely.
    country: address?.country ?? 'United States',
    countryCode: address?.countryCode ?? 'us',
  };
}

export class ContextService {
  constructor(
    private readonly nominatim: NominatimClient,
    private readonly overpass: OverpassClient,
    private readonly census: CensusClient,
  ) {}

  /** Never throws for provider failures: missing facts stay empty and `partial` is set. Rejects only when `signal` aborts. */
  async get(point: Coordinates, signal?: AbortSignal): Promise<LocationContext> {
    signal?.throwIfAborted();
    const overall = withTimeout(signal, OVERALL_TIMEOUT_MS);
    const [reverse, overpass, census] = await Promise.all([
      settle(this.nominatim.reverse(point, withTimeout(overall, REVERSE_TIMEOUT_MS))),
      settle(this.overpass.lookup(point, overall)),
      settle(this.census.lookup(point, overall)),
    ]);
    signal?.throwIfAborted();

    const details = reverse.ok ? reverse.value : null;
    const address = details?.address ?? null;
    const area = census.ok && census.value ? areaFromCensus(census.value, address) : areaFromAddress(address);

    return {
      road: overpass.ok ? overpass.value.road : null,
      campus: overpass.ok ? overpass.value.campus : (details?.campus ?? null),
      streetLights: overpass.ok ? overpass.value.streetLights : [],
      area,
      partial: !reverse.ok || !overpass.ok || !census.ok,
    };
  }
}
