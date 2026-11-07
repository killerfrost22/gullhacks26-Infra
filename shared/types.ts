export type IssueType = 'pothole' | 'light_outage' | 'other';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationAddress {
  street: string | null;
  city: string | null;
  houseNumber: string | null;
}

export interface LocationResult extends Coordinates {
  label: string;
  address: LocationAddress | null;
}

export interface SelectedLocation extends LocationResult {
  source: 'photo' | 'device' | 'search' | 'map';
  confirmed: boolean;
  accuracyMeters?: number;
}

/** Map facts about the confirmed point. Clues for routing, never proof of ownership. */
export interface LocationContext {
  /** Nearest mapped road. `ref` is a route number such as "MD 193" or "US 1". */
  road: { name: string | null; ref: string | null; kind: string | null; operator: string | null } | null;
  /** Enclosing college/university grounds, when the point is inside one. `website` is the campus's mapped homepage. */
  campus: { name: string; operator: string | null; website: string | null } | null;
  /** Mapped street lights within ~30 m, with operator/pole ref when tagged. */
  streetLights: { operator: string | null; ref: string | null }[];
  /** Administrative areas, most local first. `municipality` is null when the point is outside any incorporated city/town. */
  place: {
    municipality: string | null;
    county: string | null;
    state: string | null;
    country: string | null;
    countryCode: string | null;
  };
}

export interface PreparedPhoto {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
  gps: Coordinates | null;
}

export interface InvestigationRequest {
  photoDataUrl: string;
  location: LocationResult;
  /** One free-text answer: where exactly this is and what the reporter noticed. May be empty. Max 1500 chars. */
  details: string;
}

export interface ResearchSource {
  title: string;
  url: string;
  note: string;
}

export interface ReportTimings {
  contextMs: number;
  researchMs: number;
  formattingMs: number;
  verificationMs: number;
  totalMs: number;
}

export interface Investigation {
  id: string;
  createdAt: string;
  timings: ReportTimings;
  issue: {
    type: IssueType;
    title: string;
    summary: string;
    observations: string[];
  };
  location: LocationResult;
  context: LocationContext | null;
  responsibility: {
    status: 'source_supported' | 'needs_review' | 'unresolved';
    organization: string | null;
    department: string | null;
    email: string | null;
    emailSourceUrl: string | null;
    phone: string | null;
    reportingUrl: string | null;
    reason: string;
  };
  sources: ResearchSource[];
  warnings: string[];
  searchSuggestionsHtml: string[];
}

export interface ServiceHealth {
  researchConfigured: boolean;
  model: string;
}

export interface ApiError {
  error: string;
  code?: string;
}
