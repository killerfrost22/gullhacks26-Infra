import { z } from 'zod';
import type { IssueKind } from '../../shared/types.js';

// A Record forces this list to stay in step with `IssueKind`.
const ISSUE_KIND_FLAGS: Record<IssueKind, true> = {
  pothole: true,
  road_damage: true,
  streetlight: true,
  traffic_signal: true,
  sign: true,
  sidewalk: true,
  drainage: true,
  graffiti: true,
  litter: true,
  tree: true,
  utility: true,
  other: true,
};
const ISSUE_KINDS = Object.keys(ISSUE_KIND_FLAGS) as [IssueKind, ...IssueKind[]];

const ref = (what: string) =>
  z
    .string()
    .nullable()
    .describe(`${what}: a source ID from the list (like "S2") or the exact URL written in the brief; null if unknown.`);

const issueSchema = (hasPhoto: boolean) =>
  z.object({
    kind: z.enum(ISSUE_KINDS),
    title: z
      .string()
      .describe('Short and plain, like "Deep pothole in the travel lane". Only the problem: never a street, place, or address.'),
    summary: z
      .string()
      .describe('One or two sentences on what is wrong. Only the problem: never a street, place, or address (the app adds the location from the pin).'),
    observations: z
      .array(z.string())
      .describe(
        hasPhoto
          ? 'Up to 4 short facts about the problem seen in the photo or stated in the note. Never a street, place, or address.'
          : 'Up to 4 short facts about the problem stated in the note. Never a street, place, or address.',
      ),
  });

const sharedFields = {
  organization: z.string().nullable().describe('The office that maintains this spot, exactly as the brief names it; null if unknown.'),
  department: z.string().nullable().describe('The division or department inside that office, name only; null if unknown.'),
  reason: z
    .string()
    .describe('Why this office, written to "you", 1-3 plain sentences. No certainty the brief lacks. No email addresses, phone numbers, or URLs.'),
  coverageQuote: z
    .string()
    .nullable()
    .describe('The coverage sentence copied character for character from the brief, without surrounding quote marks.'),
  coverageSource: ref('Page the coverage sentence is on'),
  reportingPage: ref('Official page or form for reporting this issue'),
  officialWebsite: ref("The office's own website"),
  email: z.string().nullable().describe('Email address from the brief, or null.'),
  emailSource: ref('Page the email is published on'),
  phone: z.string().nullable().describe('Phone number from the brief, or null.'),
  phoneSource: ref('Page the phone number is published on'),
  sources: z.array(z.string()).describe('Source IDs or exact URLs of pages that support the answer, most useful first.'),
  noteSaysLightIsOut: z.boolean().nullable().describe('Streetlights only: does the user note say the light is out? Else null.'),
};

/** What the format call returns for a report with a photo. Every claim in it is re-checked before anything reaches the user. */
export const draftSchema = z.object({
  issue: issueSchema(true),
  ...sharedFields,
  photoLooksDaytime: z.boolean().nullable().describe('Streetlights only: does the photo look like daytime? Else null.'),
});

/** The same draft for a report without a photo: no field or description mentions a photo. */
const noPhotoDraftSchema = z.object({ issue: issueSchema(false), ...sharedFields });

export type Draft = z.infer<typeof draftSchema>;

/** JSON Schema for Gemini structured output. `$schema` isn't in Gemini's documented schema subset, so it's dropped. */
export function draftJsonSchema(hasPhoto: boolean): Record<string, unknown> {
  const { $schema: _dialect, ...schema } = z.toJSONSchema(hasPhoto ? draftSchema : noPhotoDraftSchema) as Record<string, unknown>;
  return schema;
}

/** Validates the format call's JSON. Without a photo there is nothing to judge daylight from, so that answer is null. */
export function parseDraftValue(value: unknown, hasPhoto: boolean): Draft | null {
  if (hasPhoto) return draftSchema.safeParse(value).data ?? null;
  const parsed = noPhotoDraftSchema.safeParse(value);
  return parsed.success ? { ...parsed.data, photoLooksDaytime: null } : null;
}
