import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Crosshair, Map as MapIcon, MapPin, Search } from 'lucide-react';
import * as L from 'leaflet';
import type { Coordinates, LocationResult, SelectedLocation } from '../../shared/types';
import { shortPlace } from '../lib/place';

interface LocationPickerProps {
  value: SelectedLocation | null;
  onChange: (value: SelectedLocation | null) => void;
  photoGps: Coordinates | null;
  disabled?: boolean;
}

function isLocationResult(value: unknown): value is LocationResult {
  if (!value || typeof value !== 'object') return false;
  const location = value as LocationResult;
  const address = location.address;
  return typeof location.label === 'string' && location.label.trim().length > 0
    && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90
    && Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180
    && (address === null || (typeof address === 'object'
      && (address.street === null || (typeof address.street === 'string' && address.street.trim().length > 0))
      && (address.city === null || (typeof address.city === 'string' && address.city.trim().length > 0))
      && (address.houseNumber === null || (typeof address.houseNumber === 'string' && address.houseNumber.trim().length > 0))));
}

async function locationRequest(path: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Location lookup isn’t responding.');
  }
  if (!body || typeof body !== 'object') throw new Error('Location lookup sent back something unexpected.');
  const result = body as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Location lookup is down for a moment.');
  return result;
}

const sourceLabels: Record<SelectedLocation['source'], string> = {
  photo: 'From your photo', device: 'From your phone', search: 'From search', map: 'Pinned on map',
};

const pinIcon = L.divIcon({
  className: 'civic-map-pin',
  iconSize: [44, 52],
  iconAnchor: [22, 46],
  html: '<svg width="36" height="46" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><filter id="pin-glow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#F59E0B" flood-opacity="0.5"/></filter></defs><path d="M16 40S2 25 2 16a14 14 0 1 1 28 0c0 9-14 24-14 24Z" fill="#0F172A" stroke="#F59E0B" stroke-width="2.5" filter="url(#pin-glow)"/><circle cx="16" cy="16" r="5" fill="#F59E0B"/></svg>',
});

export function LocationPicker({ value, onChange, photoGps, disabled = false }: LocationPickerProps) {
  const [query, setQuery] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [results, setResults] = useState<LocationResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [error, setError] = useState('');
  const [reverseWarning, setReverseWarning] = useState('');
  const [mapError, setMapError] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const valueRef = useRef(value);
  const expectedSelection = useRef(value);
  const disabledRef = useRef(disabled);
  const mounted = useRef(true);
  const revision = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);
  const reverseAbort = useRef<AbortController | null>(null);
  const lastPhotoKey = useRef<string | null>(null);
  valueRef.current = value;
  disabledRef.current = disabled;

  function beginSelectionIntent() {
    revision.current += 1;
    searchAbort.current?.abort();
    reverseAbort.current?.abort();
    setSearching(false);
    setReversing(false);
    setLocating(false);
    setError('');
    setReverseWarning('');
    return revision.current;
  }

  function selectLocation(coordinates: Coordinates, source: SelectedLocation['source'], accuracyMeters?: number, place?: LocationResult) {
    if (disabledRef.current || !mounted.current) return;
    const ticket = beginSelectionIntent();
    setResults([]);
    setSearched(false);
    const selection: SelectedLocation = {
      ...coordinates,
      source,
      confirmed: false,
      label: place?.label || 'Selected map location',
      address: place?.address ?? null,
      ...(accuracyMeters !== undefined ? { accuracyMeters } : {}),
    };
    valueRef.current = selection;
    expectedSelection.current = selection;
    onChange(selection);
    if (place) return;

    const controller = new AbortController();
    reverseAbort.current = controller;
    setReversing(true);
    const parameters = new URLSearchParams({ lat: String(coordinates.latitude), lon: String(coordinates.longitude) });
    void locationRequest(`/api/locations/reverse?${parameters}`, controller.signal)
      .then((body) => {
        if (controller.signal.aborted || ticket !== revision.current || disabledRef.current || !mounted.current) return;
        if (!valueRef.current || valueRef.current.latitude !== selection.latitude
          || valueRef.current.longitude !== selection.longitude || valueRef.current.source !== selection.source) return;
        if (!isLocationResult(body.result)) throw new Error('The location service did not return an address for this point.');
        const next = { ...valueRef.current, ...selection, label: body.result.label, address: body.result.address, confirmed: valueRef.current?.confirmed ?? false };
        valueRef.current = next;
        onChange(next);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || ticket !== revision.current || !mounted.current) return;
        setReverseWarning('Couldn’t look up the street address. The pin is still set, so you can keep going.');
      })
      .finally(() => {
        if (ticket === revision.current && mounted.current) setReversing(false);
      });
  }

  const selectRef = useRef(selectLocation);
  selectRef.current = selectLocation;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revision.current += 1;
      searchAbort.current?.abort();
      reverseAbort.current?.abort();
      lastPhotoKey.current = null;
    };
  }, []);

  useEffect(() => {
    if (!disabled) return;
    revision.current += 1;
    searchAbort.current?.abort();
    reverseAbort.current?.abort();
    setSearching(false);
    setReversing(false);
    setLocating(false);
  }, [disabled]);

  useEffect(() => {
    const expected = expectedSelection.current;
    if (value?.latitude === expected?.latitude && value?.longitude === expected?.longitude
      && value?.source === expected?.source) return;
    expectedSelection.current = value;
    revision.current += 1;
    searchAbort.current?.abort();
    reverseAbort.current?.abort();
    setSearching(false);
    setReversing(false);
    setLocating(false);
  }, [value?.latitude, value?.longitude, value?.source]);

  const photoLatitude = photoGps?.latitude;
  const photoLongitude = photoGps?.longitude;
  useEffect(() => {
    if (photoLatitude === undefined || photoLongitude === undefined) {
      lastPhotoKey.current = null;
      return;
    }
    if (disabled || !Number.isFinite(photoLatitude) || Math.abs(photoLatitude) > 90
      || !Number.isFinite(photoLongitude) || Math.abs(photoLongitude) > 180) return;
    const key = `${photoLatitude},${photoLongitude}`;
    if (lastPhotoKey.current === key) return;
    lastPhotoKey.current = key;
    // Returning from email review must not replace an already selected location.
    if (valueRef.current) return;
    selectRef.current({ latitude: photoLatitude, longitude: photoLongitude }, 'photo');
  }, [photoLatitude, photoLongitude, disabled]);

  useEffect(() => {
    if (!mapContainer.current) return;
    let map: L.Map | null = null;
    let resize: ResizeObserver | undefined;
    try {
      map = L.map(mapContainer.current, { center: [20, 0], zoom: 2, scrollWheelZoom: false });
      mapRef.current = map;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map).on('tileerror', () => {
        if (mounted.current) setMapError('Some map tiles didn’t load. Search still works.');
      });
      map.on('click', (event: L.LeafletMouseEvent) => {
        if (!disabledRef.current) selectRef.current({ latitude: event.latlng.lat, longitude: event.latlng.wrap().lng }, 'map');
      });
      if (typeof ResizeObserver !== 'undefined') {
        resize = new ResizeObserver(() => map?.invalidateSize());
        resize.observe(mapContainer.current);
      }
    } catch {
      setMapError('The map couldn’t open. Search for the address instead.');
    }
    return () => {
      resize?.disconnect();
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  const selectedLatitude = value?.latitude;
  const selectedLongitude = value?.longitude;
  useEffect(() => {
    const map = mapRef.current;
    if (selectedLatitude === undefined || selectedLongitude === undefined) {
      markerRef.current?.remove();
      markerRef.current = null;
      map?.setView([20, 0], 2);
      setLatitude('');
      setLongitude('');
      return;
    }
    setLatitude(String(selectedLatitude));
    setLongitude(String(selectedLongitude));
    if (!map) return;
    const point = L.latLng(selectedLatitude, selectedLongitude);
    if (!markerRef.current) {
      const marker = L.marker(point, { icon: pinIcon, draggable: !disabledRef.current, title: 'Issue location — drag to adjust', keyboard: true }).addTo(map);
      marker.on('dragend', () => {
        if (disabledRef.current) return;
        const moved = marker.getLatLng().wrap();
        selectRef.current({ latitude: moved.lat, longitude: moved.lng }, 'map');
      });
      markerRef.current = marker;
      map.setView(point, 16);
    } else {
      markerRef.current.setLatLng(point);
      map.setView(point, Math.max(15, map.getZoom()));
    }
  }, [selectedLatitude, selectedLongitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const interaction of [map.dragging, map.touchZoom, map.doubleClickZoom, map.boxZoom, map.keyboard]) {
      if (disabled) interaction.disable(); else interaction.enable();
    }
    if (disabled) markerRef.current?.dragging?.disable(); else markerRef.current?.dragging?.enable();
  }, [disabled, selectedLatitude, selectedLongitude]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const term = query.trim();
    if (!term) { setError('Type an address or place first.'); return; }
    const ticket = beginSelectionIntent();
    const controller = new AbortController();
    searchAbort.current = controller;
    setResults([]);
    setSearched(false);
    setSearching(true);
    try {
      const body = await locationRequest(`/api/locations/search?${new URLSearchParams({ q: term })}`, controller.signal);
      if (controller.signal.aborted || ticket !== revision.current || disabledRef.current || !mounted.current) return;
      if (!Array.isArray(body.results) || !body.results.every(isLocationResult)) throw new Error('Search came back empty-handed.');
      setResults(body.results);
      setSearched(true);
    } catch (cause) {
      if (!controller.signal.aborted && ticket === revision.current && mounted.current) {
        setError(`${cause instanceof Error ? cause.message : 'Search failed.'} Try again, or add the city.`);
      }
    } finally {
      if (ticket === revision.current && mounted.current) setSearching(false);
    }
  }

  function useDeviceLocation() {
    if (disabled) return;
    const ticket = beginSelectionIntent();
    setResults([]);
    setSearched(false);
    if (!navigator.geolocation) { setError('This browser can’t share your location. Search for the address instead.'); return; }
    if (!window.isSecureContext) { setError('Location only works over https. Search for the address instead.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      if (ticket !== revision.current || disabledRef.current || !mounted.current) return;
      const { latitude: lat, longitude: lon, accuracy } = position.coords;
      selectRef.current({ latitude: lat, longitude: lon }, 'device', Number.isFinite(accuracy) ? accuracy : undefined);
    }, (failure) => {
      if (ticket !== revision.current || disabledRef.current || !mounted.current) return;
      setLocating(false);
      setError(failure.code === 1 ? 'Location access is off. Turn it on in your browser settings, or search for the address.'
        : failure.code === 3 ? 'Finding you took too long. Try again, or search for the address.'
          : 'Your location isn’t available right now. Search for the address instead.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  function submitCoordinates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
      setError('Latitude goes from −90 to 90 and longitude from −180 to 180.');
      return;
    }
    selectLocation({ latitude: lat, longitude: lon }, 'map');
  }

  const showMap = Boolean(value) || mapOpen;

  return (
    <div className="location-picker">
      <div className="location-tools">
        {photoGps && <button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => selectLocation(photoGps, 'photo')}><MapPin size={18} aria-hidden="true" />Photo location</button>}
        <button type="button" className="btn btn-ghost" disabled={disabled || locating} onClick={useDeviceLocation}><Crosshair size={18} aria-hidden="true" />{locating ? 'Finding you…' : 'I’m standing here'}</button>
      </div>
      <form className="search-form" role="search" onSubmit={(event) => { void search(event); }}>
        <label htmlFor="location-search" className="visually-hidden">Search for an address or place</label>
        <div className="search-row">
          <Search size={18} aria-hidden="true" className="search-icon" />
          <input id="location-search" type="search" autoComplete="off" enterKeyHint="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={300} disabled={disabled} placeholder="Address or place" />
          <button type="submit" className="btn btn-primary btn-compact" disabled={disabled || searching}>{searching ? 'Searching…' : 'Search'}</button>
        </div>
      </form>
      <div role="status" aria-live="polite">
        {searched && !results.length && <p className="field-hint">Nothing found. Try adding the city.</p>}
      </div>
      {results.length > 0 && <ul className="search-results" aria-label="Search results">
        {results.map((result, index) => <li key={`${result.latitude},${result.longitude},${index}`}><button type="button" disabled={disabled} onClick={() => selectLocation(result, 'search', undefined, result)}><MapPin size={16} aria-hidden="true" /><span>{result.label}</span></button></li>)}
      </ul>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div ref={mapContainer} className="map-panel" hidden={!showMap} role="region" aria-label="Map. Tap to place the pin, or drag the pin to move it." />
      {mapError && <p className="field-error" role="alert">{mapError}</p>}
      {!showMap && <button type="button" className="btn-link map-reveal" disabled={disabled} onClick={() => setMapOpen(true)}><MapIcon size={16} aria-hidden="true" />Or pick the spot on a map</button>}
      {value && <div className="location-summary">
        <p className="location-label"><MapPin size={18} aria-hidden="true" /><span>{reversing && !value.address ? 'Looking up the address…' : shortPlace(value)}</span></p>
        <p className="field-hint">{sourceLabels[value.source]}{value.accuracyMeters !== undefined && ` · accurate to about ${Math.round(value.accuracyMeters)} m`} · drag the pin if it’s off.</p>
        {reverseWarning && <p className="field-hint" role="status">{reverseWarning}</p>}
        <button type="button" className="btn btn-primary btn-block" disabled={disabled} onClick={() => {
          if (!value || disabled) return;
          const next = { ...value, confirmed: true };
          valueRef.current = next;
          onChange(next);
        }}><Check size={19} aria-hidden="true" />Yes, it’s here</button>
      </div>}
      {showMap && <details className="coordinate-details">
        <summary>Enter coordinates instead</summary>
        <form className="coordinate-form" onSubmit={submitCoordinates}>
          <div><label htmlFor="location-latitude">Latitude</label><input id="location-latitude" type="number" inputMode="text" enterKeyHint="next" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} disabled={disabled} placeholder="38.98860" /></div>
          <div><label htmlFor="location-longitude">Longitude</label><input id="location-longitude" type="number" inputMode="text" enterKeyHint="done" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} disabled={disabled} placeholder="-76.93650" /></div>
          <button type="submit" className="btn btn-ghost" disabled={disabled}>Set</button>
        </form>
      </details>}
    </div>
  );
}
