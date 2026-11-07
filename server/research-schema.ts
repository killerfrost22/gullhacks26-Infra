import { z } from 'zod';

const nullableText = z.string().min(1).max(300).nullable();
const nullableUrl = z.string().min(1).max(2048).nullable();

// Limits are a little looser than the prompt asks for, so a slightly long sentence is not a failed report.
export const researchSchema = z.object({
  issue: z.object({
    type: z.enum(['pothole', 'light_outage', 'other']),
    title: z.string().min(1).max(60),
    summary: z.string().min(1).max(240),
    observations: z.array(z.string().min(1).max(240)).max(5),
    // Two narrow model judgments; the server combines them to decide whether a light outage needs a daylight caveat.
    photoLooksLikeDaytime: z.boolean(),
    detailsSayLightIsOut: z.boolean(),
  }).strict(),
  responsibility: z.object({
    status: z.enum(['source_supported', 'needs_review', 'unresolved']),
    organization: nullableText,
    department: nullableText,
    email: z.string().min(1).max(254).nullable(),
    emailSourceUrl: nullableUrl,
    phone: z.string().min(1).max(80).nullable(),
    phoneSourceUrl: nullableUrl,
    reportingUrl: nullableUrl,
    reason: z.string().min(1).max(600),
    coverageSourceUrl: nullableUrl,
    coverageQuote: z.string().max(300).nullable(),
  }).strict(),
  sources: z.array(z.object({
    title: z.string().min(1).max(300),
    url: z.string().min(1).max(2048),
    note: z.string().min(1).max(300),
    isOfficial: z.boolean(),
  }).strict()).max(8),
  warnings: z.array(z.string().min(1).max(300)).max(5),
}).strict();

export type ResearchOutput = z.infer<typeof researchSchema>;
