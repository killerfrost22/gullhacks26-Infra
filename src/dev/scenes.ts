// Dev-only: `?scene=<name>` freezes the home page in one state for review, with no live calls.
// Loaded by dynamic import behind `import.meta.env.DEV`, so production bundles never include it.
import { LocateError } from '../lib/geolocate';
import { errorMessages } from '../lib/messages';
import { PhotoError, type PreparedPhoto } from '../lib/photo';
import { EMPTY_PIN, type PinState, type Scene } from '../flow/state';
import {
  CONTEXT,
  CONTEXT_TOWN,
  PLACE,
  REPORT_BEST_MATCH,
  REPORT_CONFIRMED,
  REPORT_UNIDENTIFIED,
  SEARCH_RESULTS,
  fixturePhoto,
} from './fixtures';

const ONLINE = { researchConfigured: true };

const pinAt: PinState = {
  ...EMPTY_PIN,
  point: { latitude: PLACE.latitude, longitude: PLACE.longitude },
  source: 'search',
  place: PLACE,
  placeResolved: true,
};

const confirmed: PinState = { ...pinAt, confirmed: true, context: CONTEXT };

const NOTE = 'Eastbound lane, right next to the bus stop. It has been getting bigger for two weeks.';

type SceneBuilder = (photo: PreparedPhoto) => Scene;

const SCENES: Record<string, { gps?: boolean; build: SceneBuilder }> = {
  empty: { build: () => ({ health: ONLINE }) },
  photo: { build: (photo) => ({ health: ONLINE, flow: { photo } }) },
  'photo-gps': { gps: true, build: (photo) => ({ health: ONLINE, flow: { photo } }) },
  pin: { build: (photo) => ({ health: ONLINE, flow: { photo, pin: pinAt } }) },
  'pin-results': {
    build: (photo) => ({ health: ONLINE, flow: { photo }, pinUi: { query: 'Campus Drive', results: SEARCH_RESULTS } }),
  },
  'pin-manual': { build: (photo) => ({ health: ONLINE, flow: { photo }, pinUi: { manualOpen: true } }) },
  note: { build: (photo) => ({ health: ONLINE, flow: { photo, pin: confirmed, details: NOTE } }) },
  'note-town': {
    build: (photo) => ({ health: ONLINE, flow: { photo, pin: { ...confirmed, context: CONTEXT_TOWN }, details: NOTE } }),
  },
  'result-unidentified-town': {
    build: (photo) => ({
      health: ONLINE,
      flow: {
        photo,
        pin: { ...confirmed, context: CONTEXT_TOWN },
        details: '',
        phase: 'result',
        report: { ...REPORT_UNIDENTIFIED, context: CONTEXT_TOWN },
      },
    }),
  },
  'note-limit': {
    build: (photo) => ({ health: ONLINE, flow: { photo, pin: confirmed, details: NOTE.repeat(17).slice(0, 1420) } }),
  },
  investigating: {
    build: (photo) => ({ health: ONLINE, flow: { photo, pin: confirmed, details: NOTE, phase: 'investigating' } }),
  },
  'result-confirmed': {
    build: (photo) => ({
      health: ONLINE,
      flow: { photo, pin: confirmed, details: NOTE, phase: 'result', report: REPORT_CONFIRMED },
    }),
  },
  'result-best-match': {
    build: (photo) => ({
      health: ONLINE,
      flow: { photo, pin: confirmed, details: NOTE, phase: 'result', report: REPORT_BEST_MATCH },
    }),
  },
  'result-unidentified': {
    build: (photo) => ({
      health: ONLINE,
      flow: { photo, pin: confirmed, details: '', phase: 'result', report: REPORT_UNIDENTIFIED },
    }),
  },
  offline: {
    build: (photo) => ({ health: { researchConfigured: false }, flow: { photo, pin: confirmed, details: NOTE } }),
  },
  'error-heic': { build: () => ({ health: ONLINE, photoError: new PhotoError('HEIC').message }) },
  'error-too-large': { build: () => ({ health: ONLINE, photoError: new PhotoError('TOO_LARGE').message }) },
  'error-unsupported': { build: () => ({ health: ONLINE, photoError: new PhotoError('UNSUPPORTED').message }) },
  'error-locate-denied': {
    build: (photo) => ({ health: ONLINE, flow: { photo }, pinUi: { locateError: new LocateError('DENIED').message } }),
  },
  'error-locate-insecure': {
    build: (photo) => ({ health: ONLINE, flow: { photo }, pinUi: { locateError: new LocateError('INSECURE').message } }),
  },
  'error-search-empty': {
    build: (photo) => ({ health: ONLINE, flow: { photo }, pinUi: { query: 'zzzz qqq', results: [] } }),
  },
  'error-geocoder': {
    build: (photo) => ({
      health: ONLINE,
      flow: { photo },
      pinUi: { query: 'Campus Drive', searchError: errorMessages.GEOCODER_UNAVAILABLE },
    }),
  },
  'error-rate-limit': {
    build: (photo) => ({
      health: ONLINE,
      flow: { photo, pin: confirmed, details: NOTE, error: errorMessages.RESEARCH_RATE_LIMITED },
    }),
  },
  'error-research-failed': {
    build: (photo) => ({ health: ONLINE, flow: { photo, pin: confirmed, details: NOTE, error: errorMessages.RESEARCH_FAILED } }),
  },
  'error-quota': {
    build: (photo) => ({ health: ONLINE, flow: { photo, pin: confirmed, details: NOTE, error: errorMessages.RESEARCH_QUOTA } }),
  },
  'error-network': {
    build: (photo) => ({ health: ONLINE, flow: { photo, pin: confirmed, details: NOTE, error: errorMessages.NETWORK_ERROR } }),
  },
};

export const SCENE_NAMES = Object.keys(SCENES);

export async function loadScene(name: string): Promise<Scene | null> {
  const entry = SCENES[name];
  if (!entry) {
    console.warn(`Unknown scene "${name}". Try one of: ${SCENE_NAMES.join(', ')}`);
    return null;
  }
  return entry.build(await fixturePhoto(entry.gps ?? false));
}
