import type { LocationContext } from '../../shared/types';
import { requestJson } from './api';

export async function fetchLocationContext(latitude: number, longitude: number, signal: AbortSignal): Promise<LocationContext | null> {
  const query = new URLSearchParams({ lat: String(latitude), lon: String(longitude) });
  const body = await requestJson<{ context?: LocationContext | null }>(`/api/locations/context?${query}`, { signal, headers: { Accept: 'application/json' } });
  return body.context ?? null;
}

export type ContextChipKind = 'road' | 'campus' | 'area' | 'light';

export interface ContextChip {
  kind: ContextChipKind;
  label: string;
}

/** Short, human labels for what the map knows about this spot. */
export function contextChips(context: LocationContext | null): ContextChip[] {
  if (!context) return [];
  const chips: ContextChip[] = [];
  const { road, campus, place, streetLights } = context;
  if (road && (road.name || road.ref)) {
    const label = road.name && road.ref && !road.name.includes(road.ref) ? `${road.name} (${road.ref})` : road.name || road.ref!;
    chips.push({ kind: 'road', label });
  }
  if (campus) chips.push({ kind: 'campus', label: campus.name });
  if (place.municipality) {
    chips.push({ kind: 'area', label: place.county ? `${place.municipality}, ${place.county}` : place.municipality });
  } else if (place.county) {
    chips.push({ kind: 'area', label: `${place.county} · outside city limits` });
  }
  const operator = streetLights.find((light) => light.operator)?.operator;
  if (operator) chips.push({ kind: 'light', label: `Street lights run by ${operator}` });
  return chips;
}
