import { z } from 'zod';
import type { Coordinates } from '../../shared/types.js';
import { type Clock, ProviderError, TtlCache, fetchJson, pointKey, stringTag, userAgentFrom, withTimeout } from './support.js';

/**
 * Census Geocoder, geographies by coordinates. Documented at
 * https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html (last updated 02/2026).
 * Layer IDs come from the TIGERweb `tigerWMS_Current` map service: 22 County Subdivisions, 28 Incorporated Places,
 * 30 Census Designated Places, 80 States, 82 Counties.
 */
const ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
const LAYERS = '22,28,30,80,82';
const TIMEOUT_MS = 7_000;
const CACHE_TTL_MS = 15 * 60_000;

/**
 * Functional status codes that mean no working local government: fictitious, inactive, nonfunctioning, statistical.
 * See the TIGER/Line technical documentation, "Functional Status Codes".
 */
const NOT_A_GOVERNMENT: Record<string, true> = { F: true, I: true, N: true, S: true };
/**
 * County-layer entries with no government: Connecticut planning regions (`N`), statistical areas (`S`).
 * `F` stays: Baltimore city and Virginia's independent cities are county equivalents run by a real city.
 */
const NOT_A_COUNTY_GOVERNMENT: Record<string, true> = { N: true, S: true };

export interface CensusArea {
  municipality: string | null;
  /** Census legal type word, lowercase (`city`, `town`, `township`), or `null` when Census gives none. */
  municipalityKind: string | null;
  incorporation: 'incorporated' | 'unincorporated';
  county: string | null;
  state: string | null;
}

const Geography = z.object({
  NAME: z.unknown().optional(),
  BASENAME: z.unknown().optional(),
  FUNCSTAT: z.unknown().optional(),
});
const Layer = z.array(z.unknown()).optional().catch(undefined);

const Body = z.object({
  result: z.object({
    geographies: z.record(z.string(), Layer),
  }),
});

function firstNamed(layer: unknown[] | undefined, keep: (funcstat: string | null) => boolean = () => true) {
  for (const raw of layer ?? []) {
    const parsed = Geography.safeParse(raw);
    if (!parsed.success) continue;
    const name = stringTag(parsed.data.NAME);
    if (!name) continue;
    if (!keep(stringTag(parsed.data.FUNCSTAT))) continue;
    const baseName = stringTag(parsed.data.BASENAME) ?? name;
    return { name, baseName, kind: kindWord(name, baseName) };
  }
  return null;
}

/** `College Park city` minus `College Park` is `city`. Census puts the legal type only in `NAME`. */
function kindWord(name: string, baseName: string): string | null {
  if (name === baseName) return null;
  const index = name.indexOf(baseName);
  if (index < 0) return null;
  const rest = `${name.slice(0, index)} ${name.slice(index + baseName.length)}`.replace(/\s+/g, ' ').trim();
  return rest === '' ? null : rest.toLowerCase();
}

/**
 * `null` means Census gives no usable answer: outside the U.S., or no local government it can name.
 * - An incorporated place wins (a village inside a New York town reports to the village first).
 * - Otherwise an active county subdivision (FUNCSTAT `A`) is the local government: New England towns,
 *   townships in NJ, PA, MI, WI. Subdivisions elsewhere are election or statistical districts and don't count.
 * - Census Designated Places have no government of their own, so a CDP alone still means unincorporated.
 * - A county with no government is left out (`county: null`), and alone it can't make a point unincorporated.
 */
export function parseCensus(body: unknown): CensusArea | null {
  const parsed = Body.safeParse(body);
  if (!parsed.success) throw new ProviderError('Census answer had an unexpected shape');
  const layers = parsed.data.result.geographies;
  const place = firstNamed(layers['Incorporated Places'], (funcstat) => funcstat === null || NOT_A_GOVERNMENT[funcstat] !== true);
  const town = firstNamed(layers['County Subdivisions'], (funcstat) => funcstat === 'A');
  const county = firstNamed(layers.Counties, (funcstat) => funcstat === null || NOT_A_COUNTY_GOVERNMENT[funcstat] !== true);
  const state = firstNamed(layers.States);
  const local = place ?? town;
  if (local) {
    return {
      municipality: local.baseName,
      municipalityKind: local.kind,
      incorporation: 'incorporated',
      county: county?.name ?? null,
      state: state?.name ?? null,
    };
  }
  if (county) return { municipality: null, municipalityKind: null, incorporation: 'unincorporated', county: county.name, state: state?.name ?? null };
  return null;
}

export function buildCensusUrl(point: Coordinates): string {
  const params = new URLSearchParams({
    x: point.longitude.toFixed(6),
    y: point.latitude.toFixed(6),
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    layers: LAYERS,
    format: 'json',
  });
  return `${ENDPOINT}?${params}`;
}

export class CensusClient {
  readonly #cache: TtlCache<CensusArea | null>;

  constructor(
    clock: Clock,
    private readonly env: NodeJS.ProcessEnv,
  ) {
    this.#cache = new TtlCache(CACHE_TTL_MS, clock);
  }

  /** Throws `ProviderError` on failure, or when aborted. */
  async lookup(point: Coordinates, signal?: AbortSignal): Promise<CensusArea | null> {
    const key = pointKey(point);
    const cached = this.#cache.get(key);
    if (cached) return cached.value;
    const body = await fetchJson(buildCensusUrl(point), {
      signal: withTimeout(signal, TIMEOUT_MS),
      userAgent: userAgentFrom(this.env),
    });
    const area = parseCensus(body);
    this.#cache.set(key, area);
    return area;
  }
}
