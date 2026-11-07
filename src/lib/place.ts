import type { LocationContext, Place } from '../../shared/types';

// Decimal degrees ("38.98972, -76.93776", "38.9897° N") and degrees-minutes-seconds ("38°59'23\"N").
const COORDINATE_PATTERNS = [
  /[-+−]?\b\d{1,3}°\s*\d{1,2}\s*['′]\s*(?:\d{1,2}(?:\.\d+)?\s*["″])?\s*[NSEW]?/gi,
  /[-+−]?\b\d{1,3}\.\d{3,}\s*°?\s*[NSEW]?\b/gi,
  /\b(?:lat(?:itude)?|lon(?:gitude)?|lng)\b\s*[:=]?/gi,
];

/** Removes anything that looks like a coordinate and tidies the separators left behind. */
export function stripCoordinates(text: string): string {
  let result = text;
  for (const pattern of COORDINATE_PATTERNS) result = result.replace(pattern, ' ');
  return result
    .replace(/\(\s*[,;\s]*\)/g, ' ')
    .replace(/\s*([,;])(?:\s*[,;])+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:/·-]+|[\s,;:/·-]+$/g, '')
    .trim();
}

const sameText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

/** "4306 Campus Drive, College Park", or `null` when nothing but coordinates is known. Every part comes from the data. */
export function describePlace(place: Place, context?: LocationContext | null): string | null {
  const address = place.address;
  const road = address?.road?.trim() || null;
  const street = road ? (address?.houseNumber?.trim() ? `${address.houseNumber.trim()} ${road}` : road) : null;
  const spot = street ?? context?.campus?.name ?? context?.road?.name ?? null;
  const locality = address?.locality?.trim() || context?.area?.municipality || null;
  const parts: string[] = [];
  for (const part of [spot, locality]) {
    if (part && !parts.some((existing) => sameText(existing, part))) parts.push(part);
  }
  if (parts.length > 0) return parts.join(', ');

  // No usable address parts: fall back to the first pieces of the label, minus any coordinates.
  const segments = stripCoordinates(place.label)
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
  // Nominatim labels start "4306, Campus Drive, ..."; keep the house number with its street.
  if (segments.length > 1 && /^\d+[A-Za-z]?$/.test(segments[0])) segments.splice(0, 2, `${segments[0]} ${segments[1]}`);
  const label = segments.slice(0, 2).join(', ');
  return label || null;
}

/** A short, human label for the pin. Never coordinates. */
export function shortPlace(place: Place, context?: LocationContext | null): string {
  return describePlace(place, context) ?? 'Pinned spot';
}

export interface ContextFact {
  kind: 'road' | 'campus' | 'area' | 'light';
  label: string;
  detail: string | null;
}

const joinDetail = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ') || null;
// Census legal types that read naturally as "<Kind> of <name>". Others (e.g. "CDP", "charter township") show the bare name.
const MUNICIPALITY_KINDS = new Set(['city', 'town', 'village', 'borough', 'township', 'municipality']);

/** Map facts as chips. Clues about the spot, not claims about who maintains it. */
export function contextFacts(context: LocationContext): ContextFact[] {
  const facts: ContextFact[] = [];
  const { road, campus, area } = context;

  if (road) {
    const ref = road.ref?.split(';').map((part) => part.trim()).filter(Boolean).join(' / ') || null;
    const label = road.name ?? ref;
    if (label) facts.push({ kind: 'road', label, detail: joinDetail([road.name ? ref : null, road.operator]) });
  }

  if (campus) {
    const operator = campus.operator && !sameText(campus.operator, campus.name) ? campus.operator : null;
    facts.push({ kind: 'campus', label: campus.name, detail: operator });
  }

  if (area) {
    const { municipality, municipalityKind, county, state, incorporation } = area;
    let label: string | null = null;
    let detail: string | null = null;
    if (incorporation === 'incorporated' && municipality) {
      // The type word comes only from Census; never assume "City" (University Park, MD is a town).
      const kind = municipalityKind?.toLowerCase() ?? '';
      label = MUNICIPALITY_KINDS.has(kind) ? `${kind[0].toUpperCase()}${kind.slice(1)} of ${municipality}` : municipality;
      detail = joinDetail([county, state]);
    } else if (incorporation === 'unincorporated') {
      label = county ? `Unincorporated ${county}` : 'Unincorporated area';
      detail = state;
    } else if (municipality || county) {
      // No Census answer: the name is only the geocoder's locality, so don't call it a city.
      label = municipality ?? county;
      detail = joinDetail([municipality ? county : null, state]);
    }
    if (label) facts.push({ kind: 'area', label, detail });
  }

  const light = context.streetLights[0];
  if (light) {
    facts.push({
      kind: 'light',
      label: `Street light ${Math.round(light.distanceMeters)} m away`,
      detail: joinDetail([light.operator, light.ref ? `pole ${light.ref}` : null]),
    });
  }

  return facts;
}
