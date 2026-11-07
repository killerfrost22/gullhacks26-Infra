import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, LoaderCircle, LocateFixed, Search, TriangleAlert } from 'lucide-react';
import type { Coordinates, Place } from '../../shared/types';
import { reversePlace, searchPlaces } from '../lib/api';
import { locateDevice } from '../lib/geolocate';
import { messageFor } from '../lib/messages';
import type { PinSource, PinState, PinUi } from './state';

const PinMap = lazy(() => import('./PinMap'));

/** Label for a pin the geocoder has no address for. Never raw coordinates. */
export const UNNAMED_PLACE_LABEL = 'Pinned spot (no street address found)';

const SOURCE_LABEL: Record<PinSource, string> = {
  photo: 'From your photo’s location',
  device: 'From your device’s location',
  search: 'From your search',
  map: 'Placed on the map',
  manual: 'From the coordinates you entered',
};

interface PinStepProps {
  pin: PinState;
  photoGps: Coordinates | null;
  onPin: (update: Pick<PinState, 'point' | 'source' | 'accuracyMeters' | 'place' | 'placeResolved'>) => void;
  onPlaceResolved: (place: Place | null) => void;
  onConfirm: () => void;
  initialUi?: Partial<PinUi>;
}

export function PinStep({ pin, photoGps, onPin, onPlaceResolved, onConfirm, initialUi }: PinStepProps) {
  const [query, setQuery] = useState(initialUi?.query ?? '');
  const [results, setResults] = useState<Place[] | null>(initialUi?.results ?? null);
  // The result previewed on the map while you hover or focus it in the list (or hover its marker).
  const [activeResult, setActiveResult] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(initialUi?.searchError ?? null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(initialUi?.locateError ?? null);
  const [reverseError, setReverseError] = useState<string | null>(initialUi?.reverseError ?? null);
  const [manualOpen, setManualOpen] = useState(initialUi?.manualOpen ?? false);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const locateAbort = useRef<AbortController | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  // The results list disappears once a result is chosen; keyboard focus moves on to the confirm button.
  const focusConfirm = useRef(false);

  useEffect(() => {
    if (focusConfirm.current && confirmButton.current) {
      focusConfirm.current = false;
      confirmButton.current.focus();
    }
  });

  // Photo GPS only suggests the spot: it places the pin, and the user still has to confirm it.
  useEffect(() => {
    if (photoGps && !pin.point) {
      onPin({ point: photoGps, source: 'photo', accuracyMeters: null, place: null, placeResolved: false });
    }
    // Runs only when a new photo's GPS arrives, never to undo a pin the user moved.
  }, [photoGps]);

  // Address for the pin. Waits for the pin to settle so dragging doesn't fire a lookup per move.
  useEffect(() => {
    if (!pin.point || pin.placeResolved) return;
    const controller = new AbortController();
    const point = pin.point;
    const timer = window.setTimeout(() => {
      setReverseError(null);
      reversePlace(point, controller.signal)
        .then((place) => onPlaceResolved(place))
        .catch((error: unknown) => {
          const message = messageFor(error);
          if (message === null) return;
          setReverseError(message);
          onPlaceResolved(null);
        });
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [pin.point, pin.placeResolved, onPlaceResolved]);

  useEffect(
    () => () => {
      searchAbort.current?.abort();
      locateAbort.current?.abort();
    },
    [],
  );

  function placeAt(point: Coordinates, source: PinSource, accuracyMeters: number | null = null) {
    setReverseError(null);
    onPin({ point, source, accuracyMeters, place: null, placeResolved: false });
  }

  async function locate() {
    locateAbort.current?.abort();
    const controller = new AbortController();
    locateAbort.current = controller;
    setLocating(true);
    setLocateError(null);
    try {
      const { point, accuracyMeters } = await locateDevice(controller.signal);
      placeAt(point, 'device', accuracyMeters);
    } catch (error) {
      if (!controller.signal.aborted) setLocateError(messageFor(error));
    } finally {
      if (locateAbort.current === controller) setLocating(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setSearchError('Type at least 2 characters, like a street and town.');
      setResults(null);
      return;
    }
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    setSearchError(null);
    try {
      const found = await searchPlaces(q, controller.signal);
      setActiveResult(null);
      setResults(found);
    } catch (error) {
      const message = messageFor(error);
      if (message) setSearchError(message);
      setResults(null);
    } finally {
      if (searchAbort.current === controller) setSearching(false);
    }
  }

  function choose(place: Place) {
    setResults(null);
    setActiveResult(null);
    focusConfirm.current = true;
    setReverseError(null);
    onPin({
      point: { latitude: place.latitude, longitude: place.longitude },
      source: 'search',
      accuracyMeters: null,
      place,
      placeResolved: true,
    });
  }

  function placeManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const latitude = Number(lat.trim());
    const longitude = Number(lon.trim());
    if (lat.trim() === '' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setManualError('Latitude must be a number from -90 to 90, like 38.9869.');
      return;
    }
    if (lon.trim() === '' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setManualError('Longitude must be a number from -180 to 180, like -76.9426.');
      return;
    }
    setManualError(null);
    placeAt({ latitude, longitude }, 'manual');
  }

  const resolving = pin.point !== null && !pin.placeResolved;
  const label = pin.place?.label ?? (pin.placeResolved ? UNNAMED_PLACE_LABEL : null);

  return (
    <div className="pin-step">
      <div className="pin-sources">
        <button type="button" className="btn" onClick={locate} disabled={locating} aria-busy={locating}>
          {locating ? (
            <LoaderCircle size={20} className="spin" aria-hidden="true" />
          ) : (
            <LocateFixed size={20} aria-hidden="true" />
          )}
          {locating ? 'Finding you…' : 'I’m standing here'}
        </button>
        <form className="pin-search" role="search" onSubmit={search}>
          <label htmlFor="pin-search-input" className="visually-hidden">
            Search for an address or place
          </label>
          <input
            id="pin-search-input"
            className="input"
            type="search"
            enterKeyHint="search"
            autoComplete="street-address"
            placeholder="Address or place"
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" className="btn btn--ink" disabled={searching} aria-busy={searching}>
            {searching ? (
              <LoaderCircle size={20} className="spin" aria-hidden="true" />
            ) : (
              <Search size={20} aria-hidden="true" />
            )}
            <span className="visually-hidden">Search</span>
          </button>
        </form>
      </div>

      {locateError && (
        <div className="notice notice--warn" role="alert">
          <TriangleAlert size={20} aria-hidden="true" />
          <p>{locateError}</p>
        </div>
      )}
      {searchError && (
        <div className="notice notice--warn" role="alert">
          <TriangleAlert size={20} aria-hidden="true" />
          <p>{searchError}</p>
        </div>
      )}
      {results && (
        <div className="pin-results" role="region" aria-label="Search results">
          <p className="pin-results-count" role="status">
            {results.length === 0
              ? 'No matches. Try a street and town, or tap the map instead.'
              : `${results.length} ${results.length === 1 ? 'place' : 'places'} found. They’re numbered on the map.`}
          </p>
          {results.length > 0 && (
            <>
              {new Set(results.map((place) => place.label)).size < results.length && (
                <p className="pin-results-hint">Some share a name. Match the number to its spot on the map.</p>
              )}
              <ol role="list" onMouseLeave={() => setActiveResult(null)}>
                {results.map((place, index) => (
                  <li key={`${place.latitude},${place.longitude},${index}`}>
                    <button
                      type="button"
                      className="pin-result"
                      data-active={activeResult === index || undefined}
                      onClick={() => choose(place)}
                      onMouseEnter={() => setActiveResult(index)}
                      onFocus={() => setActiveResult(index)}
                      onBlur={() => setActiveResult(null)}
                    >
                      <span className="pin-result-num">{index + 1}</span>
                      <span>
                        <span className="visually-hidden"> of {results.length}: </span>
                        {place.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      <Suspense
        fallback={
          <div className="pin-map-loading" role="status">
            <LoaderCircle size={20} className="spin" aria-hidden="true" />
            Loading the map…
          </div>
        }
      >
        <PinMap
          point={pin.point}
          source={pin.source}
          onPick={(point) => placeAt(point, 'map')}
          candidates={results && results.length > 0 ? results : null}
          activeCandidate={activeResult}
          onPreviewCandidate={setActiveResult}
          onChooseCandidate={(index) => results && choose(results[index])}
        />
      </Suspense>

      <details className="pin-manual" open={manualOpen} onToggle={(event) => setManualOpen(event.currentTarget.open)}>
        <summary>Enter coordinates instead</summary>
        <form className="pin-manual-form" onSubmit={placeManual} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="pin-lat">
              Latitude
            </label>
            <input
              id="pin-lat"
              className="input"
              inputMode="decimal"
              autoComplete="off"
              placeholder="38.9869"
              value={lat}
              aria-invalid={manualError?.startsWith('Latitude') || undefined}
              onChange={(event) => setLat(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="pin-lon">
              Longitude
            </label>
            <input
              id="pin-lon"
              className="input"
              inputMode="decimal"
              autoComplete="off"
              placeholder="-76.9426"
              value={lon}
              aria-invalid={manualError?.startsWith('Longitude') || undefined}
              onChange={(event) => setLon(event.target.value)}
            />
          </div>
          <button type="submit" className="btn btn--ink">
            Place the pin
          </button>
          {manualError && (
            <p className="field-error" role="alert">
              {manualError}
            </p>
          )}
        </form>
      </details>

      <div className="pin-confirm" aria-live="polite">
        {pin.point === null ? (
          <p className="pin-confirm-empty">No pin yet. Use one of the options above, or tap the map.</p>
        ) : (
          <>
            <div className="pin-label">
              <span className="kicker">{pin.source ? SOURCE_LABEL[pin.source] : 'Your pin'}</span>
              <p className="pin-label-text">
                {resolving ? (
                  <>
                    <LoaderCircle size={18} className="spin" aria-hidden="true" />
                    Looking up the address…
                  </>
                ) : (
                  label
                )}
              </p>
              {pin.accuracyMeters !== null && (
                <p className="pin-accuracy">
                  Accurate to about {Math.max(1, Math.round(pin.accuracyMeters))} m.
                  {pin.accuracyMeters > 50 && ' Drag the pin to the exact spot.'}
                </p>
              )}
              {pin.source === 'photo' && <p className="pin-accuracy">Check it’s right before you confirm.</p>}
              {reverseError && <p className="pin-accuracy">{reverseError} You can still use this spot.</p>}
            </div>
            <button
              ref={confirmButton}
              type="button"
              className="btn btn--primary btn--lg"
              onClick={onConfirm}
              disabled={resolving}
            >
              <Check size={22} aria-hidden="true" />
              Yes, it’s here
            </button>
          </>
        )}
      </div>
    </div>
  );
}
