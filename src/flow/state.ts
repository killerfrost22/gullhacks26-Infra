import type { Coordinates, Health, Investigation, LocationContext, Place } from '../../shared/types';
import type { PreparedPhoto } from '../lib/photo';

export type PinSource = 'photo' | 'device' | 'search' | 'map' | 'manual';

export interface PinState {
  point: Coordinates | null;
  source: PinSource | null;
  accuracyMeters: number | null;
  /** The address for `point`. `null` until it resolves, or when the geocoder has none for this spot. */
  place: Place | null;
  /** The reverse lookup finished (with or without an address). */
  placeResolved: boolean;
  confirmed: boolean;
  context: LocationContext | null;
  contextLoading: boolean;
}

export const EMPTY_PIN: PinState = {
  point: null,
  source: null,
  accuracyMeters: null,
  place: null,
  placeResolved: false,
  confirmed: false,
  context: null,
  contextLoading: false,
};

export type Phase = 'compose' | 'investigating' | 'result';

export interface FlowState {
  photo: PreparedPhoto | null;
  pin: PinState;
  details: string;
  phase: Phase;
  report: Investigation | null;
  /** Message for the last failed report request. */
  error: string | null;
}

export const EMPTY_FLOW: FlowState = {
  photo: null,
  pin: EMPTY_PIN,
  details: '',
  phase: 'compose',
  report: null,
  error: null,
};

/** UI state inside the pin step that a dev scene may preset. */
export interface PinUi {
  query: string;
  results: Place[] | null;
  searchError: string | null;
  locateError: string | null;
  reverseError: string | null;
  manualOpen: boolean;
}

/** A frozen app state for the dev-only `?scene=` harness. Never built into production. */
export interface Scene {
  flow?: Partial<FlowState>;
  /** `undefined` keeps the live `/api/health` answer. */
  health?: Health;
  photoError?: string;
  pinUi?: Partial<PinUi>;
}
