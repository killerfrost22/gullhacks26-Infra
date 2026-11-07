import { z } from 'zod';
import { ApiError } from './errors.js';
import { researchSchema } from './research-schema.js';
import type { ResearchOutput } from './research-schema.js';
import { canonicalSourceUrl, isGroundingRedirect, resolveGroundingRedirect } from './source-verification.js';

const interactionSchema = z.object({
  status: z.string(),
  steps: z.array(z.object({ type: z.string() }).passthrough()).max(200),
});
const searchResultsSchema = z.array(z.object({ search_suggestions: z.string().max(100_000).optional() }));
const urlResultsSchema = z.array(z.object({ url: z.string().optional(), status: z.string().optional() }));
const contentSchema = z.array(z.object({
  type: z.string(),
  text: z.string().optional(),
  annotations: z.array(z.object({ type: z.string(), url: z.string().optional(), title: z.string().optional() })).optional(),
}));

export interface GroundedGeminiResearch {
  brief: string;
  /** Tool-provided URLs mapped to the citation's publisher hint (Google Search cites the bare domain as `title`). */
  sourceUrls: Map<string, string | null>;
  searchSuggestionsHtml: string[];
}

/** Trust tool metadata, never URLs or search claims embedded in generated prose. */
export function parseGeminiResearch(value: unknown): GroundedGeminiResearch {
  const parsed = interactionSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(502, 'Gemini returned an invalid interaction response. No routing was assumed.', 'RESEARCH_INVALID_OUTPUT');
  if (parsed.data.status !== 'completed') throw new ApiError(502, 'Gemini did not complete the source research. No routing was assumed.', 'RESEARCH_INCOMPLETE');

  const searchCalls = new Set<string>();
  const urlCalls = new Set<string>();
  for (const step of parsed.data.steps) {
    if (typeof step.id !== 'string') continue;
    if (step.type === 'google_search_call') searchCalls.add(step.id);
    if (step.type === 'url_context_call') urlCalls.add(step.id);
  }

  let searched = false;
  let outputText = '';
  const sourceUrls = new Map<string, string | null>();
  const suggestions = new Set<string>();
  for (const step of parsed.data.steps) {
    if (step.type === 'google_search_result' && typeof step.call_id === 'string'
      && searchCalls.has(step.call_id) && step.is_error !== true) {
      const results = searchResultsSchema.safeParse(step.result);
      if (!results.success) continue;
      searched = true;
      for (const item of results.data) if (item.search_suggestions?.trim()) suggestions.add(item.search_suggestions);
    }
    if (step.type === 'url_context_result' && typeof step.call_id === 'string'
      && urlCalls.has(step.call_id) && step.is_error !== true) {
      const results = urlResultsSchema.safeParse(step.result);
      if (results.success) for (const item of results.data) if (item.status === 'success' && item.url) sourceUrls.set(item.url, null);
    }
    if (step.type === 'model_output') {
      const content = contentSchema.safeParse(step.content);
      if (!content.success) continue;
      // Earlier outputs may be planning text; retain the final evidence brief.
      let text = '';
      for (const item of content.data) {
        if (item.type === 'text' && item.text) text += item.text;
        for (const annotation of item.annotations ?? []) {
          if (annotation.type === 'url_citation' && annotation.url && !sourceUrls.has(annotation.url)) {
            sourceUrls.set(annotation.url, annotation.title?.trim() || null);
          }
        }
      }
      outputText = text;
    }
  }
  if (!searched) throw new ApiError(502, 'Gemini returned no completed Google Search research. No routing was assumed.', 'RESEARCH_NOT_GROUNDED');
  if (!suggestions.size) throw new ApiError(502, 'Gemini returned no required Google Search attribution. No research result was displayed.', 'RESEARCH_ATTRIBUTION_MISSING');
  if (suggestions.size > 5) throw new ApiError(502, 'Gemini returned more search-attribution groups than can be displayed. No result was assumed.', 'RESEARCH_INVALID_OUTPUT');

  if (!outputText.trim()) throw new ApiError(502, 'Gemini returned no research brief. No routing was assumed.', 'RESEARCH_INVALID_OUTPUT');
  return { brief: outputText, sourceUrls, searchSuggestionsHtml: [...suggestions] };
}

const MAX_RESOLVED_REDIRECTS = 12;
const BRIEF_REDIRECT_PATTERN = /https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\/[^\s)\]"'<>]+/g;

/**
 * Replace Google's opaque grounding redirects with the pages they point to, in both the tool-provided source set and
 * the brief's prose (the model links its claims with the same redirect URLs), so the formatter, provenance checks, and
 * page verification all see real publisher URLs. Every cited redirect is resolved once, in parallel. Unresolvable
 * redirects, and targets whose host contradicts the citation's publisher domain, are dropped.
 */
export async function resolveGroundedResearch(
  grounded: Pick<GroundedGeminiResearch, 'brief' | 'sourceUrls'>,
  signal: AbortSignal,
  resolve: (redirectUrl: string, signal: AbortSignal) => Promise<string | null> = resolveGroundingRedirect,
): Promise<{ brief: string; sourceUrls: Set<string> }> {
  const sourceUrls = new Set<string>();
  const redirects: [string, string | null][] = [];
  for (const [url, title] of grounded.sourceUrls) {
    if (isGroundingRedirect(url)) {
      if (redirects.length < MAX_RESOLVED_REDIRECTS) redirects.push([url, title]);
      continue;
    }
    const canonical = canonicalSourceUrl(url);
    if (canonical) sourceUrls.add(canonical);
  }
  const targets = new Map<string, string>();
  await Promise.all(redirects.map(async ([url, title]) => {
    const target = await resolve(url, signal);
    const canonical = target ? canonicalSourceUrl(target) : null;
    if (!canonical || isGroundingRedirect(canonical)) return;
    const domain = title?.toLowerCase().replace(/^www\./, '');
    if (domain && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) {
      const host = new URL(canonical).hostname.toLowerCase();
      if (host !== domain && !host.endsWith(`.${domain}`)) return;
    }
    targets.set(url, canonical);
  }));
  for (const [url] of redirects) {
    const target = targets.get(url);
    if (target) sourceUrls.add(target);
  }
  const brief = grounded.brief.replace(BRIEF_REDIRECT_PATTERN, (url) => targets.get(url) ?? '(link unavailable)');
  return { brief, sourceUrls };
}

/** The formatting phase cannot provide new research or source authority. */
export function parseGeminiReport(value: unknown): ResearchOutput {
  const parsed = interactionSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(502, 'Gemini returned an invalid report response. No routing was assumed.', 'RESEARCH_INVALID_OUTPUT');
  if (parsed.data.status !== 'completed') throw new ApiError(502, 'Gemini did not finish generating the report. No routing was assumed.', 'RESEARCH_INCOMPLETE');
  let outputText = '';
  for (const step of parsed.data.steps) {
    if (step.type.endsWith('_call') || step.type.endsWith('_result')) {
      throw new ApiError(502, 'Gemini returned unexpected tools during report formatting. No routing was assumed.', 'RESEARCH_INVALID_OUTPUT');
    }
    if (step.type !== 'model_output') continue;
    const content = contentSchema.safeParse(step.content);
    if (!content.success) throw new ApiError(502, 'Gemini returned invalid report content. No routing was assumed.', 'RESEARCH_INVALID_OUTPUT');
    outputText = '';
    for (const item of content.data) if (item.type === 'text' && item.text) outputText += item.text;
  }
  let researchValue: unknown;
  try { researchValue = JSON.parse(outputText) as unknown; }
  catch { throw new ApiError(502, 'Gemini returned an unreadable report. No routing was assumed.', 'RESEARCH_INVALID_OUTPUT'); }
  const research = researchSchema.safeParse(researchValue);
  if (!research.success) throw new ApiError(502, 'Gemini returned an invalid report. No routing was assumed.', 'RESEARCH_INVALID_OUTPUT');
  return research.data;
}
