// Single source of truth for API shapes. The web app imports these types directly.
import { z } from "zod";
import { CATEGORIES, JURISDICTION_LEVELS, SEVERITIES } from "./constants.ts";

const contactSchema = z.object({
  name: z.string().describe("Official organization name, e.g. 'City of Salisbury Department of Field Operations'."),
  department: z.string().describe("Specific department or division, or '' if unknown."),
  jurisdictionLevel: z.enum(JURISDICTION_LEVELS),
  reasoning: z.string().describe("Why this organization maintains this asset at this location."),
  phone: z.string().describe("Phone number found in sources, or ''."),
  email: z.string().describe("Email found in sources, or ''."),
  website: z.string().describe("Official website URL, or ''."),
  reportingUrl: z.string().describe("Official service-request / 311 / report-a-problem URL, or ''."),
});

export const analysisSchema = z.object({
  isInfrastructureIssue: z.boolean(),
  category: z.enum(CATEGORIES),
  title: z.string().describe("Short title, e.g. 'Large pothole in northbound lane of Main St'."),
  description: z.string().describe("What is visible in the photo, factual, 1-3 sentences."),
  severity: z.enum(SEVERITIES),
  severityReason: z.string(),
  confidence: z.number().min(0).max(1).describe("Confidence in the category classification, 0-1."),
  hazards: z.array(z.string()).describe("Specific risks, e.g. 'tire damage', 'trip hazard'. Empty if none."),
  responsibleParty: contactSchema,
  alternateParties: z
    .array(z.object({ name: z.string(), reason: z.string() }))
    .describe("Up to 2 other organizations that may be responsible if ownership is ambiguous."),
  reportDraft: z.object({
    subject: z.string(),
    body: z.string(),
  }),
});

export type Category = (typeof CATEGORIES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Analysis = z.infer<typeof analysisSchema>;

export interface Place {
  lat: number;
  lng: number;
  displayName: string;
  road: string | null;
  houseNumber: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  /** OSM feature class/type at the point, e.g. highway/residential. */
  osmCategory: string | null;
  osmType: string | null;
  /** Route number such as "US 13" or "MD 12" — strong hint for state ownership. */
  roadRef: string | null;
  operator: string | null;
}

export interface Source {
  title: string;
  uri: string;
}

export type LocationSource = "photo" | "device" | "map";

export interface AnalyzeResponse {
  analysisId: string;
  photoUrl: string;
  place: Place;
  analysis: Analysis;
  sources: Source[];
  searchQueries: string[];
  model: string;
}

export const createReportSchema = z.object({
  analysisId: z.string().uuid(),
  locationSource: z.enum(["photo", "device", "map"]),
  note: z.string().max(1000).default(""),
  edits: z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    category: z.enum(CATEGORIES),
    severity: z.enum(SEVERITIES),
    reportDraft: z.object({
      subject: z.string().max(300),
      body: z.string().max(5000),
    }),
  }),
});

export type CreateReportRequest = z.input<typeof createReportSchema>;

export interface Report {
  id: string;
  createdAt: string;
  status: "submitted";
  photoUrl: string;
  locationSource: LocationSource;
  note: string;
  place: Place;
  analysis: Analysis;
  sources: Source[];
  model: string;
}

export interface HealthResponse {
  ok: true;
  geminiConfigured: boolean;
  model: string;
}
