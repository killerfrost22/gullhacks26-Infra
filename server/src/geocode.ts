import { setTimeout as sleep } from "node:timers/promises";
import { config, HttpError } from "./config.ts";
import type { Place } from "./schema.ts";

// Nominatim usage policy: max 1 request/second, identifying User-Agent, cache results.
// https://operations.osmfoundation.org/policies/nominatim/
const MIN_INTERVAL_MS = 1100;
const cache = new Map<string, Place>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

interface NominatimReverse {
  error?: string;
  display_name?: string;
  category?: string;
  type?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string> | null;
  /** Nominatim treats `ref` (route number) as a name tag. */
  namedetails?: Record<string, string> | null;
}

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function reverseGeocode(lat: number, lng: number): Promise<Place> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const url = new URL("/reverse", config.nominatimUrl);
  url.search = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lng),
    zoom: "17", // street level: we need the road to decide jurisdiction
    addressdetails: "1",
    extratags: "1",
    namedetails: "1",
  }).toString();

  const agent = `gullhacks26-Infra/0.1 (+https://github.com/killerfrost22/gullhacks26-Infra${
    config.nominatimContact ? `; ${config.nominatimContact}` : ""
  })`;

  const res = await throttled(() =>
    fetch(url, { headers: { "User-Agent": agent, "Accept-Language": "en" }, signal: AbortSignal.timeout(10_000) }),
  ).catch((err: Error) => {
    throw new HttpError(502, `Reverse geocoding failed: ${err.message}`);
  });
  if (!res.ok) throw new HttpError(502, `Reverse geocoding failed: HTTP ${res.status}`);

  const data = (await res.json()) as NominatimReverse;
  if (data.error || !data.display_name) {
    throw new HttpError(422, `No address found for this location (${data.error ?? "empty result"})`);
  }

  const a = data.address ?? {};
  const tags = data.extratags ?? {};
  const place: Place = {
    lat,
    lng,
    displayName: data.display_name,
    road: a.road ?? a.pedestrian ?? a.footway ?? a.path ?? null,
    houseNumber: a.house_number ?? null,
    city: a.city ?? a.town ?? a.village ?? a.hamlet ?? null,
    county: a.county ?? null,
    state: a.state ?? null,
    postcode: a.postcode ?? null,
    country: a.country ?? null,
    osmCategory: data.category ?? null,
    osmType: data.type ?? null,
    roadRef: data.namedetails?.ref ?? null,
    operator: tags.operator ?? null,
  };
  cache.set(key, place);
  return place;
}
