/**
 * The contract between the server (`server/`) and the app (`src/`).
 * Every API response body is one of these types, or `ApiErrorBody` on failure.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Address parts as the geocoder reports them. Every field is optional because coverage varies by country. */
export interface PlaceAddress {
  houseNumber: string | null;
  road: string | null;
  /** City, town, village, or hamlet as the geocoder names it. Not proof that the place is an incorporated municipality. */
  locality: string | null;
  county: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  /** ISO 3166-1 alpha-2, lowercase (`us`). */
  countryCode: string | null;
}

/** A point with a human-readable label. `label` never contains raw coordinates. */
export interface Place extends Coordinates {
  label: string;
  address: PlaceAddress | null;
}

// ---------------------------------------------------------------- map facts (GET /api/locations/context)

export interface RoadFact {
  name: string | null;
  /** Route number(s) as mapped, e.g. `US 1` or `MD 193;MD 201`. */
  ref: string | null;
  /** OpenStreetMap `highway` value, e.g. `primary`, `residential`, `service`. */
  kind: string;
  operator: string | null;
  distanceMeters: number;
}

export interface CampusFact {
  name: string;
  operator: string | null;
  /** The campus's own website as mapped. Server-side provenance trusts this host. */
  website: string | null;
}

export interface StreetLightFact {
  operator: string | null;
  /** Pole or asset number as mapped. */
  ref: string | null;
  distanceMeters: number;
}

export interface AreaFact {
  /** Base name without the type word, e.g. `College Park`, `University Park`, `Greenwich`. */
  municipality: string | null;
  /**
   * Census legal type of `municipality`, lowercase: `city`, `town`, `village`, `borough`, `township`, ...
   * `null` when unknown (no Census answer, or Census gave no type word).
   */
  municipalityKind: string | null;
  /**
   * `incorporated`: the point is inside `municipality`, a local government of its own: a Census incorporated place,
   * or an active town/township (county subdivision with a functioning government, as in New England, NY, NJ, PA, MI, WI).
   * `unincorporated`: Census found neither; the county is the local government.
   * `unknown`: no Census answer (outside the U.S. or Census failed); `municipality` is the geocoder's locality name, if any.
   */
  incorporation: 'incorporated' | 'unincorporated' | 'unknown';
  county: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
}

/** Routing clues for a pin. Clues, not proof of who maintains anything. */
export interface LocationContext {
  road: RoadFact | null;
  campus: CampusFact | null;
  /** Mapped street lights near the pin, nearest first. */
  streetLights: StreetLightFact[];
  area: AreaFact | null;
  /** True when at least one map-data provider failed or timed out, so some facts may be missing. */
  partial: boolean;
}

// ---------------------------------------------------------------- investigation (POST /api/investigate)

export const DETAILS_MAX_LENGTH = 1500;
/**
 * Without a photo, the note is the only description of the problem, so it must say at least this much
 * (trimmed). Long enough to reject "a", short enough to allow "pothole".
 */
export const DETAILS_MIN_LENGTH_WITHOUT_PHOTO = 5;
/** Upper bound for the whole JSON request body. The app keeps `photoDataUrl` below this. */
export const INVESTIGATION_BODY_LIMIT_BYTES = 6 * 1024 * 1024;

export interface InvestigationRequest {
  /**
   * `data:image/jpeg;base64,...` (PNG and WebP also accepted), already resized and stripped of metadata on the device.
   * `null` when the user reports without a photo (for example, they saw it while driving and report it later);
   * then `details` must describe the problem.
   */
  photoDataUrl: string | null;
  /** The pin the user confirmed. */
  location: Place;
  /**
   * The user's free-text note, `''` when empty. At most `DETAILS_MAX_LENGTH` characters.
   * Required (at least `DETAILS_MIN_LENGTH_WITHOUT_PHOTO` characters after trimming) when `photoDataUrl` is `null`.
   */
  details: string;
}

export type IssueKind =
  | 'pothole'
  | 'road_damage'
  | 'streetlight'
  | 'traffic_signal'
  | 'sign'
  | 'sidewalk'
  | 'drainage'
  | 'graffiti'
  | 'litter'
  | 'tree'
  | 'utility'
  | 'other';

/**
 * `confirmed`: the coverage quote was found word for word on an official page the server loaded during this report.
 * `best_match`: an organization is named, but not proven by a loaded page.
 * `unidentified`: no organization could be named. The app shows only the map facts; it never makes up an office.
 */
export type Verdict = 'confirmed' | 'best_match' | 'unidentified';

/** A contact detail that appears on `sourceUrl`, a loaded official page. */
export interface PublishedContact {
  value: string;
  sourceUrl: string;
}

export interface SourceLink {
  title: string;
  url: string;
  note: string | null;
  official: boolean;
}

export interface Investigation {
  issue: {
    kind: IssueKind;
    /** Short, e.g. "Pothole in the eastbound lane". */
    title: string;
    summary: string;
    observations: string[];
  };
  responsibility: {
    verdict: Verdict;
    /** `null` exactly when `verdict` is `unidentified`. */
    organization: string | null;
    department: string | null;
    /** Plain-language reason, written to the user. */
    reason: string;
    /** Non-null exactly when `verdict` is `confirmed`. `quote` appears word for word on `url`. */
    evidence: { url: string; quote: string } | null;
    /** Official report form or page for this office, loaded during this report. */
    reportingUrl: string | null;
    email: PublishedContact | null;
    phone: PublishedContact | null;
  };
  /** Pages the server loaded and kept. */
  sources: SourceLink[];
  /** "Before you send" notes for the user. */
  warnings: string[];
  /**
   * Google Search suggestions HTML from search grounding. Google's terms require showing it when present.
   * Untrusted: the app sanitizes it with DOMPurify before rendering.
   */
  searchSuggestionsHtml: string | null;
  /** The map facts the research used, or `null` if none arrived in time. */
  context: LocationContext | null;
  /** ISO 8601 timestamp. */
  generatedAt: string;
}

// ---------------------------------------------------------------- other endpoints

/** GET /api/health */
export interface Health {
  researchConfigured: boolean;
}

/** Header that carries the solved ALTCHA payload on POST /api/investigate. */
export const CAPTCHA_HEADER = 'X-Captcha-Token';

// ---------------------------------------------------------------- errors

export const API_ERROR_CODES = [
  'INVALID_REQUEST',
  'INVALID_PHOTO',
  'DETAILS_REQUIRED',
  'INVALID_LOCATION',
  'PAYLOAD_TOO_LARGE',
  'FORBIDDEN_ORIGIN',
  'CAPTCHA_REQUIRED',
  'CAPTCHA_INVALID',
  'RATE_LIMITED',
  'RESEARCH_RATE_LIMITED',
  'RESEARCH_UNAVAILABLE',
  'RESEARCH_QUOTA',
  'RESEARCH_FAILED',
  'GEOCODER_UNAVAILABLE',
  'NOT_FOUND',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Body of every non-2xx API response. `error` is safe to show; it never contains provider details or keys. */
export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
}
