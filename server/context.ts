import type { LocationContext } from '../shared/types.js';
import { nominatim } from './geocoder.js';

type Road = NonNullable<LocationContext['road']>;
type Campus = NonNullable<LocationContext['campus']>;
type StreetLight = LocationContext['streetLights'][number];
type Place = LocationContext['place'];

export interface OverpassFacts { road: Road | null; campus: Campus | null; streetLights: StreetLight[]; place: Place }
/** Census Bureau geographies; authoritative for US incorporation status. */
export interface CensusFacts { municipality: string | null; county: string | null; state: string | null }
export interface NominatimFacts { road: Road | null; place: Place }

/** Each provider may reject; a failed provider only removes its own facts. `census` resolves null outside the US. */
export interface ContextProviders {
  overpass(latitude: number, longitude: number, signal: AbortSignal): Promise<OverpassFacts>;
  census(latitude: number, longitude: number, signal: AbortSignal): Promise<CensusFacts | null>;
  nominatim(latitude: number, longitude: number, signal: AbortSignal): Promise<NominatimFacts>;
  /** Enclosing college or university from Nominatim outlines; used when Overpass can't answer. */
  campus(latitude: number, longitude: number, signal: AbortSignal): Promise<Campus | null>;
}

const ROAD_RADIUS_METERS = 20;
const LIGHT_RADIUS_METERS = 30;
const MAX_LIGHTS = 5;
// Not drivable: a nearby footway should not hide the street a pothole is on.
const NON_VEHICLE_HIGHWAYS = new Set(['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'bridleway', 'corridor', 'elevator',
  'platform', 'proposed', 'construction', 'abandoned', 'razed', 'street_lamp', 'bus_stop', 'crossing', 'traffic_signals']);

function tagText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().replace(/\s+/g, ' ').slice(0, 200) || null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** A mapped website tag, only if it is a plain http(s) URL. */
function httpUrl(value: unknown): string | null {
  const text = tagText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

async function fetchJson(
  url: URL,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  signal: AbortSignal,
  maxBytes: number,
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal,
    redirect: 'error',
    headers: { 'User-Agent': process.env.GEOCODER_USER_AGENT || 'FixPlease/1.0 (local development)', Accept: 'application/json', ...init.headers },
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Context provider returned ${response.status}`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error('Context provider response too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

/** Planar metres from the origin point; accurate enough at road-search radii. */
function localMeters(originLat: number, originLon: number, lat: number, lon: number): [number, number] {
  return [(lon - originLon) * Math.cos(originLat * Math.PI / 180) * 111_320, (lat - originLat) * 110_540];
}

function distanceToGeometry(lat: number, lon: number, geometry: unknown): number {
  if (!Array.isArray(geometry)) return Infinity;
  let best = Infinity;
  let previous: [number, number] | null = null;
  for (const point of geometry) {
    const { lat: pointLat, lon: pointLon } = record(point);
    if (typeof pointLat !== 'number' || typeof pointLon !== 'number') { previous = null; continue; }
    const current = localMeters(lat, lon, pointLat, pointLon);
    best = Math.min(best, Math.hypot(...current));
    if (previous) {
      const [ax, ay] = previous;
      const [dx, dy] = [current[0] - ax, current[1] - ay];
      const length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
    previous = current;
  }
  return best;
}

export function overpassQuery(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(6);
  const lon = longitude.toFixed(6);
  const latPad = 0.0005;
  const lonPad = Math.min(0.01, 0.0005 / Math.max(0.05, Math.cos(latitude * Math.PI / 180)));
  const bbox = [latitude - latPad, longitude - lonPad, latitude + latPad, longitude + lonPad].map((value) => value.toFixed(6)).join(',');
  return `[out:json][timeout:4];
is_in(${lat},${lon})->.a;
(area.a["boundary"="administrative"]["admin_level"];area.a["amenity"~"^(university|college)$"];);
out tags;
way(around:${ROAD_RADIUS_METERS},${lat},${lon})["highway"];
out tags geom(${bbox}) 25;
node(around:${LIGHT_RADIUS_METERS},${lat},${lon})["highway"="street_lamp"];
out body 20;`;
}

export function parseOverpass(latitude: number, longitude: number, value: unknown): OverpassFacts {
  const data = record(value);
  if (!Array.isArray(data.elements)) throw new Error('Invalid Overpass response');
  // Overpass reports failures (timeouts, missing area data) as a remark beside a partial or empty result.
  if (typeof data.remark === 'string' && /error|timed out/i.test(data.remark)) throw new Error('Overpass query failed');
  const admin = new Map<number, Record<string, unknown>>();
  let campus: Campus | null = null;
  const roads: { road: Road; score: number }[] = [];
  const lights: { light: StreetLight; distance: number }[] = [];
  for (const element of data.elements) {
    const { type, tags: rawTags, lat, lon, geometry } = record(element);
    const tags = record(rawTags);
    if (type === 'area') {
      const level = Number(tags.admin_level);
      if (tags.boundary === 'administrative' && Number.isInteger(level) && !admin.has(level) && tagText(tags.name)) admin.set(level, tags);
      const name = tagText(tags.name);
      if (/^(university|college)$/.test(String(tags.amenity)) && name && (!campus || tags.amenity === 'university')) {
        campus = { name, operator: tagText(tags.operator), website: httpUrl(tags.website ?? tags['contact:website']) };
      }
    } else if (type === 'way' && typeof tags.highway === 'string') {
      const distance = distanceToGeometry(latitude, longitude, geometry);
      if (!Number.isFinite(distance)) continue;
      const name = tagText(tags.name);
      const ref = tagText(tags.ref);
      const highway = tagText(tags.highway);
      const access = tagText(tags.access);
      // Prefer a named or numbered drivable road a few metres further over an unnamed link or footway.
      const score = distance + (name || ref ? 0 : 12) + (NON_VEHICLE_HIGHWAYS.has(tags.highway) ? 1000 : 0);
      roads.push({
        road: { name, ref, kind: highway && (access === 'private' || access === 'no') ? `${highway} (private access)` : highway, operator: tagText(tags.operator) },
        score,
      });
    } else if (type === 'node' && tags.highway === 'street_lamp' && typeof lat === 'number' && typeof lon === 'number') {
      lights.push({
        light: { operator: tagText(tags.operator), ref: tagText(tags.ref) ?? tagText(tags.lamp_ref) },
        distance: Math.hypot(...localMeters(latitude, longitude, lat, lon)),
      });
    }
  }
  roads.sort((a, b) => a.score - b.score);
  lights.sort((a, b) => a.distance - b.distance);
  const country = admin.get(2);
  const countryCode = tagText(country?.['ISO3166-1:alpha2']) ?? tagText(country?.['ISO3166-1']);
  return {
    road: roads[0]?.road ?? null,
    campus,
    streetLights: lights.slice(0, MAX_LIGHTS).map(({ light }) => light),
    place: {
      municipality: tagText(admin.get(8)?.name) ?? tagText(admin.get(7)?.name),
      county: tagText(admin.get(6)?.name),
      state: tagText(admin.get(4)?.name),
      country: tagText(country?.['name:en']) ?? tagText(country?.name),
      countryCode: countryCode?.toLowerCase() ?? null,
    },
  };
}

export function parseCensus(value: unknown): CensusFacts | null {
  const geographies = record(record(record(value).result).geographies);
  const first = (layer: string): Record<string, unknown> | undefined => {
    const items = geographies[layer];
    return Array.isArray(items) ? items.map(record)[0] : undefined;
  };
  const state = tagText(first('States')?.NAME);
  if (!state) return null;
  const subdivisions = Array.isArray(geographies['County Subdivisions']) ? geographies['County Subdivisions'].map(record) : [];
  // Towns/townships with an active general-purpose government (New England, NJ, PA, …) are municipalities too.
  const activeSubdivision = subdivisions.find((item) => item.FUNCSTAT === 'A');
  return {
    municipality: tagText(first('Incorporated Places')?.BASENAME) ?? tagText(activeSubdivision?.NAME),
    county: tagText(first('Counties')?.NAME),
    state,
  };
}

export function parseNominatimContext(value: unknown): NominatimFacts {
  const data = record(value);
  const address = record(data.address);
  const countryCode = tagText(address.country_code)?.toLowerCase() ?? null;
  const road: Road | null = data.category === 'highway'
    ? { name: tagText(data.name) ?? tagText(address.road), ref: tagText(record(data.namedetails).ref), kind: tagText(data.type), operator: tagText(record(data.extratags).operator) }
    : tagText(address.road) ? { name: tagText(address.road), ref: null, kind: null, operator: null } : null;
  return {
    road,
    place: {
      // Nominatim cannot tell incorporated US places from unincorporated ones; the Census covers the US instead.
      municipality: countryCode === 'us' ? null
        : tagText(address.city) ?? tagText(address.town) ?? tagText(address.village) ?? tagText(address.municipality),
      county: tagText(address.county),
      state: tagText(address.state),
      country: tagText(address.country),
      countryCode,
    },
  };
}

// Campus centroids can sit a kilometre or more from their edges, so search a ~2 km box around the pin.
const CAMPUS_SEARCH_DEGREES = 0.02;
const CAMPUS_OUTLINES_CHECKED = 2;

/** College/university areas from a Nominatim search whose bounding box holds the point, largest first. */
export function campusCandidates(latitude: number, longitude: number, value: unknown): { name: string; osmId: string }[] {
  if (!Array.isArray(value)) return [];
  const found: { name: string; osmId: string; area: number }[] = [];
  for (const item of value) {
    const place = record(item);
    const name = tagText(place.name);
    const kind = place.osm_type === 'relation' ? 'R' : place.osm_type === 'way' ? 'W' : null;
    const box = Array.isArray(place.boundingbox) ? place.boundingbox.map(Number) : [];
    if (!name || !kind || typeof place.osm_id !== 'number' || place.category !== 'amenity'
      || !/^(university|college)$/.test(String(place.type)) || box.length !== 4 || !box.every(Number.isFinite)) continue;
    const [south, north, west, east] = box;
    if (latitude < south || latitude > north || longitude < west || longitude > east) continue;
    found.push({ name, osmId: `${kind}${place.osm_id}`, area: (north - south) * (east - west) });
  }
  // A main campus encloses its schools and institutes, so the largest outline is checked first.
  return found.sort((a, b) => b.area - a.area).map(({ name, osmId }) => ({ name, osmId }));
}

/** Even-odd ray cast over a GeoJSON ring of [longitude, latitude] pairs. */
function ringContains(ring: unknown, longitude: number, latitude: number): boolean {
  if (!Array.isArray(ring)) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = Array.isArray(ring[i]) ? ring[i] as number[] : [];
    const [xj, yj] = Array.isArray(ring[j]) ? ring[j] as number[] : [];
    if ((yi > latitude) !== (yj > latitude) && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonContains(rings: unknown, longitude: number, latitude: number): boolean {
  return Array.isArray(rings) && ringContains(rings[0], longitude, latitude)
    && !rings.slice(1).some((hole) => ringContains(hole, longitude, latitude));
}

/** Whether a GeoJSON Polygon or MultiPolygon (holes respected) contains the point. Other shapes never do. */
export function geometryContains(geometry: unknown, latitude: number, longitude: number): boolean {
  const shape = record(geometry);
  if (shape.type === 'Polygon') return polygonContains(shape.coordinates, longitude, latitude);
  if (shape.type === 'MultiPolygon' && Array.isArray(shape.coordinates)) {
    return shape.coordinates.some((polygon) => polygonContains(polygon, longitude, latitude));
  }
  return false;
}

// The public Overpass instance is often at capacity; after a failure, back off instead of spending every lookup's budget on it.
const OVERPASS_BACKOFF_MS = 60_000;
let overpassRetryAt = 0;

export const defaultContextProviders: ContextProviders = {
  async overpass(latitude, longitude, signal) {
    if (Date.now() < overpassRetryAt) throw new Error('Overpass backing off after a recent failure');
    const endpoint = new URL(process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter');
    if (!['https:', 'http:'].includes(endpoint.protocol)) throw new Error('OVERPASS_URL must be http(s)');
    try {
      const data = await fetchJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: overpassQuery(latitude, longitude) }).toString(),
      }, signal, 1_000_000);
      return parseOverpass(latitude, longitude, data);
    } catch (error) {
      overpassRetryAt = Date.now() + OVERPASS_BACKOFF_MS;
      throw error;
    }
  },
  async census(latitude, longitude, signal) {
    // Rough bounds of the US states and Puerto Rico; the Census answers outside them with no geographies anyway.
    if (latitude < 17.5 || latitude > 71.5 || longitude < -179.5 || longitude > -64.5) return null;
    const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/coordinates');
    url.search = new URLSearchParams({
      x: String(longitude), y: String(latitude), benchmark: 'Public_AR_Current', vintage: 'Current_Current',
      layers: 'States,Counties,County Subdivisions,Incorporated Places', format: 'json',
    }).toString();
    return parseCensus(await fetchJson(url, {}, signal, 512_000));
  },
  async nominatim(latitude, longitude, signal) {
    return parseNominatimContext(await nominatim('reverse', new URLSearchParams({
      lat: String(latitude), lon: String(longitude), format: 'jsonv2', addressdetails: '1', namedetails: '1', extratags: '1', zoom: '17',
    }), signal));
  },
  async campus(latitude, longitude, signal) {
    // Bounding boxes overlap neighbours, so containment is confirmed against the real outline before naming a campus.
    for (const q of ['university', 'college']) {
      const candidates = campusCandidates(latitude, longitude, await nominatim('search', new URLSearchParams({
        q, format: 'jsonv2', bounded: '1', limit: '10',
        viewbox: [longitude - CAMPUS_SEARCH_DEGREES, latitude + CAMPUS_SEARCH_DEGREES, longitude + CAMPUS_SEARCH_DEGREES, latitude - CAMPUS_SEARCH_DEGREES].join(','),
      }), signal));
      if (!candidates.length) continue;
      for (const candidate of candidates.slice(0, CAMPUS_OUTLINES_CHECKED)) {
        const outlines = await nominatim('lookup', new URLSearchParams({
          osm_ids: candidate.osmId, format: 'json', polygon_geojson: '1', polygon_threshold: '0.0001', extratags: '1',
        }), signal);
        const outline = record(Array.isArray(outlines) ? outlines[0] : null);
        const tags = record(outline.extratags);
        if (geometryContains(outline.geojson, latitude, longitude)) {
          return { name: candidate.name, operator: tagText(tags.operator), website: httpUrl(tags.website ?? tags['contact:website']) };
        }
      }
      return null;
    }
    return null;
  },
};

export function mergeContext(
  overpass: OverpassFacts | undefined,
  census: CensusFacts | null | undefined,
  nominatimFacts: NominatimFacts | undefined,
  campusFacts?: Campus | null,
): LocationContext {
  const us = census ? { country: 'United States', countryCode: 'us' } : null;
  return {
    // A successful Overpass answer with no road within 20 m is itself a clue (parking lot, private ground).
    road: overpass ? overpass.road : nominatimFacts?.road ?? null,
    campus: overpass?.campus ?? campusFacts ?? null,
    streetLights: overpass?.streetLights ?? [],
    place: {
      municipality: census ? census.municipality : overpass ? overpass.place.municipality : nominatimFacts?.place.municipality ?? null,
      county: census?.county ?? overpass?.place.county ?? nominatimFacts?.place.county ?? null,
      state: census?.state ?? overpass?.place.state ?? nominatimFacts?.place.state ?? null,
      country: overpass?.place.country ?? nominatimFacts?.place.country ?? us?.country ?? null,
      countryCode: overpass?.place.countryCode ?? nominatimFacts?.place.countryCode ?? us?.countryCode ?? null,
    },
  };
}

export type LocationContextLookup = (latitude: number, longitude: number) => Promise<LocationContext>;

/**
 * Cached by ~1 m rounded coordinates, so the app's early lookup makes the investigation's lookup free. In-flight
 * lookups are shared and never tied to one caller's request, and lookups where every provider failed are not cached.
 */
export function createLocationContextLookup({
  providers = defaultContextProviders, now = Date.now, ttlMs = 15 * 60_000, maxEntries = 500, timeoutMs = 4000,
}: { providers?: ContextProviders; now?: () => number; ttlMs?: number; maxEntries?: number; timeoutMs?: number } = {}): LocationContextLookup {
  const cache = new Map<string, { expiresAt: number; value: Promise<LocationContext> }>();
  return (latitude, longitude) => {
    const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
    const time = now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > time) return hit.value;
    cache.delete(key);
    // Insertion order is expiry order, so the oldest entries are evicted first.
    for (const [oldKey, entry] of cache) {
      if (cache.size < maxEntries && entry.expiresAt > time) break;
      cache.delete(oldKey);
    }
    const signal = AbortSignal.timeout(timeoutMs);
    const value = Promise.all([
      providers.overpass(latitude, longitude, signal).catch(() => undefined),
      providers.census(latitude, longitude, signal).catch(() => undefined),
      providers.nominatim(latitude, longitude, signal).catch(() => undefined),
      providers.campus(latitude, longitude, signal).catch(() => undefined),
    ]).then(([overpass, census, nominatimFacts, campus]) => {
      if (!overpass && !census && !nominatimFacts && cache.get(key)?.value === value) cache.delete(key);
      return mergeContext(overpass, census, nominatimFacts, campus);
    });
    cache.set(key, { expiresAt: time + ttlMs, value });
    return value;
  };
}

export const getLocationContext = createLocationContextLookup();
