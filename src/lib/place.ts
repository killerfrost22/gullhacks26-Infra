import type { LocationContext, LocationResult } from '../../shared/types';

/** "4306 Campus Drive, College Park" when the street is known; otherwise a human-readable address. Never coordinates. */
export function shortPlace(location: LocationResult, context?: LocationContext | null): string {
  const address = location.address;
  if (address?.street) {
    const street = `${address.houseNumber ? `${address.houseNumber} ` : ''}${address.street}`;
    return address.city ? `${street}, ${address.city}` : street;
  }
  if (context?.road?.name) {
    const city = address?.city || context.place?.municipality;
    return city ? `${context.road.name}, ${city}` : context.road.name;
  }
  if (context?.campus?.name) {
    return context.campus.name;
  }
  // If the label is a raw coordinate string (e.g. "Coordinates: 39.006, -76.901"), do not return coordinates.
  if (location.label && !/^\s*coordinates?:\s*-?\d/i.test(location.label) && !/^-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}$/.test(location.label.trim())) {
    return location.label;
  }
  if (address?.city) {
    return address.city;
  }
  return '';
}
