import { z } from 'zod';
import type { CampusFact, Coordinates, RoadFact, StreetLightFact } from '../../shared/types.js';
import {
  type Clock,
  ProviderError,
  TtlCache,
  baseUrlFrom,
  fetchJson,
  makeProjector,
  normalizeWebsite,
  pointKey,
  stringTag,
  userAgentFrom,
  withTimeout,
} from './support.js';

const DEFAULT_URL = 'https://overpass-api.de/api/interpreter';
const TIMEOUT_MS = 8_000;
const BACKOFF_MS = 60_000;
const CACHE_TTL_MS = 15 * 60_000;
const ROAD_RADIUS_M = 100;
const LIGHT_RADIUS_M = 40;
const MAX_LIGHTS = 5;

/** Ways a car, bus, or delivery van uses. Footways and paths are left out so a sidewalk doesn't hide the street. */
const ROAD_KINDS =
  '^((motorway|trunk|primary|secondary|tertiary)(_link)?|unclassified|residential|living_street|service|road|pedestrian|busway)$';
const ROAD_KIND = new RegExp(ROAD_KINDS);

export interface OverpassFacts {
  road: RoadFact | null;
  campus: CampusFact | null;
  streetLights: StreetLightFact[];
}

/** One round trip: roads with geometry, campus areas containing the pin, and street lamps close by. */
export function buildQuery(point: Coordinates): string {
  const at = `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
  return [
    `[out:json][timeout:${TIMEOUT_MS / 1000}];`,
    `way(around:${ROAD_RADIUS_M},${at})["highway"~"${ROAD_KINDS}"];`,
    'out geom;',
    `is_in(${at})->.containing;`,
    'area.containing["amenity"~"^(university|college)$"]["name"];',
    'out tags;',
    `node(around:${LIGHT_RADIUS_M},${at})["highway"="street_lamp"];`,
    'out body;',
  ].join('\n');
}

const Tags = z.record(z.string(), z.unknown()).catch({});
const LatLon = z.object({ lat: z.number(), lon: z.number() });

const Element = z.object({
  type: z.string(),
  tags: Tags.optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  // `out geom` can emit nulls for nodes it couldn't place.
  geometry: z.array(LatLon.nullable().catch(null)).optional().catch(undefined),
});

const Body = z.object({
  elements: z.array(z.unknown()),
  remark: z.string().optional().catch(undefined),
});

function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function parseOverpass(body: unknown, point: Coordinates): OverpassFacts {
  const parsed = Body.safeParse(body);
  if (!parsed.success) throw new ProviderError('Overpass answer had an unexpected shape');
  // Overpass reports a server-side timeout or memory limit as a 200 with a remark and partial data.
  if (parsed.data.remark && /error|timed out|out of memory/i.test(parsed.data.remark)) {
    throw new ProviderError('Overpass stopped the query early');
  }

  const project = makeProjector(point);
  const origin = { x: 0, y: 0 };
  let road: RoadFact | null = null;
  let campus: CampusFact | null = null;
  const lights: StreetLightFact[] = [];

  for (const raw of parsed.data.elements) {
    const element = Element.safeParse(raw);
    if (!element.success) continue;
    const { type, lat, lon, geometry } = element.data;
    const tags = element.data.tags ?? {};

    if (type === 'way') {
      const kind = stringTag(tags.highway);
      if (!kind || !ROAD_KIND.test(kind) || !geometry) continue;
      const points = geometry.flatMap((node) => (node ? [project(node.lat, node.lon)] : []));
      if (points.length === 0) continue;
      let distance = Math.hypot(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) distance = Math.min(distance, distanceToSegment(origin, points[i - 1], points[i]));
      if (road && road.distanceMeters <= distance) continue;
      road = {
        name: stringTag(tags.name),
        ref: stringTag(tags.ref),
        kind,
        operator: stringTag(tags.operator),
        distanceMeters: distance,
      };
    } else if (type === 'area') {
      const amenity = stringTag(tags.amenity);
      const name = stringTag(tags.name);
      if (campus || !name || (amenity !== 'university' && amenity !== 'college')) continue;
      campus = {
        name,
        operator: stringTag(tags.operator),
        website: normalizeWebsite(tags.website) ?? normalizeWebsite(tags['contact:website']),
      };
    } else if (type === 'node') {
      if (tags.highway !== 'street_lamp' || lat === undefined || lon === undefined) continue;
      const at = project(lat, lon);
      lights.push({
        operator: stringTag(tags.operator),
        ref: stringTag(tags.ref) ?? stringTag(tags.lamp_ref),
        distanceMeters: Math.hypot(at.x, at.y),
      });
    }
  }

  lights.sort((a, b) => a.distanceMeters - b.distanceMeters);
  if (road) road.distanceMeters = Math.round(road.distanceMeters);
  return {
    road,
    campus,
    streetLights: lights.slice(0, MAX_LIGHTS).map((light) => ({ ...light, distanceMeters: Math.round(light.distanceMeters) })),
  };
}

export class OverpassClient {
  readonly #cache: TtlCache<OverpassFacts>;
  #skipUntil = 0;

  constructor(
    private readonly clock: Clock,
    private readonly env: NodeJS.ProcessEnv,
  ) {
    this.#cache = new TtlCache(CACHE_TTL_MS, clock);
  }

  /**
   * Throws `ProviderError` on failure, including while backing off. The public instance is often overloaded,
   * so after a failure or timeout we leave it alone for 60 s instead of piling on.
   */
  async lookup(point: Coordinates, signal?: AbortSignal): Promise<OverpassFacts> {
    const key = pointKey(point);
    const cached = this.#cache.get(key);
    if (cached) return cached.value;
    if (this.clock.now() < this.#skipUntil) throw new ProviderError('Overpass is in backoff');
    try {
      const body = await fetchJson(baseUrlFrom(this.env.OVERPASS_URL, DEFAULT_URL), {
        method: 'POST',
        body: new URLSearchParams({ data: buildQuery(point) }).toString(),
        contentType: 'application/x-www-form-urlencoded',
        signal: withTimeout(signal, TIMEOUT_MS),
        userAgent: userAgentFrom(this.env),
      });
      const facts = parseOverpass(body, point);
      this.#cache.set(key, facts);
      return facts;
    } catch (error) {
      // Only Overpass's own failures count: HTTP errors, a bad or cut-short answer, or our 8 s deadline above.
      // Any abort of the signal passed in (a user leaving, a report's 4 s wait) is the caller's choice, not Overpass failing.
      if (!signal?.aborted) this.#skipUntil = this.clock.now() + BACKOFF_MS;
      throw error;
    }
  }
}
