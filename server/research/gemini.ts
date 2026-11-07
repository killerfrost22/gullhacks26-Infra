import { z } from 'zod';
import { ApiError } from '../errors.js';
import { isSearchRedirect } from './provenance.js';

/**
 * Gemini over plain `fetch`, using the Interactions API (POST /v1beta/interactions).
 * Docs: https://ai.google.dev/gemini-api/docs/interactions and https://ai.google.dev/api/interactions-api
 */
export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
/** Pins the response shape the parser below was written against. */
export const GEMINI_API_REVISION = '2026-05-20';
/** Chosen by the model benchmark in docs/gemini-model-benchmark.md. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

export const researchUnavailable = () => new ApiError(503, 'Report lookup is offline right now.', 'RESEARCH_UNAVAILABLE');
export const researchQuota = () =>
  new ApiError(503, "We've hit our lookup limit for now. Please try again later.", 'RESEARCH_QUOTA');
export const researchFailed = () =>
  new ApiError(502, "We couldn't finish looking this up. Please try again in a minute.", 'RESEARCH_FAILED');

/** Gemini refused to answer because the output repeated web text too closely. */
export class RecitationBlockedError extends Error {
  constructor() {
    super('Gemini blocked the response for recitation');
    this.name = 'RecitationBlockedError';
  }
}

export type InputContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mime_type: string };

export interface InteractionRequest {
  model: string;
  system_instruction: string;
  input: string | InputContent[];
  tools?: Array<{ type: 'google_search' } | { type: 'url_context' }>;
  response_format?: { type: 'text'; mime_type: 'application/json'; schema: Record<string, unknown> };
  generation_config?: { thinking_level?: 'minimal' | 'low' | 'medium' | 'high'; max_output_tokens?: number };
}

export interface CallOptions {
  apiKey: string;
  fetch: typeof fetch;
  signal: AbortSignal;
}

// ---------------------------------------------------------------- response shapes (only the fields we read)

const errorBodySchema = z.object({
  error: z.object({
    code: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
    message: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

const interactionSchema = z.object({
  status: z.string(),
  steps: z.array(z.unknown()).optional(),
  errors: z.array(z.object({ code: z.string().optional(), message: z.string().optional() })).optional(),
});
export type Interaction = z.infer<typeof interactionSchema>;

const stepSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('model_output'),
    content: z
      .array(
        z.object({
          type: z.string(),
          text: z.string().optional(),
          annotations: z
            .array(z.object({ type: z.string(), url: z.string().optional(), title: z.string().optional() }))
            .optional(),
        }),
      )
      .optional(),
  }),
  z.object({
    type: z.literal('google_search_result'),
    result: z
      .array(
        z.object({
          url: z.string().optional(),
          title: z.string().optional(),
          search_suggestions: z.string().optional(),
        }),
      )
      .optional(),
  }),
  z.object({
    type: z.literal('url_context_result'),
    result: z.array(z.object({ url: z.string().optional(), status: z.string().optional() })).optional(),
  }),
]);

// ---------------------------------------------------------------- calls

const QUOTA_CODES = ['rate_limit_exceeded', 'quota_exceeded', 'too_many_requests', 'payment_required', 'resource_exhausted'];

function classifyHttpError(status: number, body: unknown): Error {
  const error = errorBodySchema.safeParse(body).data?.error;
  const code = String(error?.code ?? '').toLowerCase();
  const providerStatus = (error?.status ?? '').toUpperCase();
  // Only the code and status are logged; the provider's message can echo request details.
  console.warn(`[research] Gemini request failed: HTTP ${status} ${code || providerStatus || 'no code'}`);
  if (code.includes('recitation')) return new RecitationBlockedError();
  const keyProblem = /api[_ ]?key/i.test(`${JSON.stringify(error?.details ?? '')} ${error?.message ?? ''}`);
  if (
    status === 401 ||
    status === 403 ||
    code === 'authentication' ||
    code === 'permission_denied' ||
    providerStatus === 'UNAUTHENTICATED' ||
    providerStatus === 'PERMISSION_DENIED' ||
    (status === 400 && keyProblem)
  ) {
    return researchUnavailable();
  }
  if (status === 429 || status === 402 || providerStatus === 'RESOURCE_EXHAUSTED' || QUOTA_CODES.includes(code)) {
    return researchQuota();
  }
  return researchFailed();
}

/** Sends one interaction with `store: false`. Throws ApiError, RecitationBlockedError, or the signal's abort reason. */
export async function createInteraction(request: InteractionRequest, options: CallOptions): Promise<Interaction> {
  let response: Response;
  try {
    response = await options.fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': options.apiKey,
        'api-revision': GEMINI_API_REVISION,
      },
      body: JSON.stringify({ ...request, store: false }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal.aborted) throw options.signal.reason;
    console.warn(`[research] Gemini request failed: ${error instanceof Error ? error.name : 'network error'}`);
    throw researchFailed();
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    if (options.signal.aborted) throw options.signal.reason;
  }
  if (!response.ok) throw classifyHttpError(response.status, body);

  const parsed = interactionSchema.safeParse(body);
  if (!parsed.success) throw researchFailed();
  const interaction = parsed.data;
  if (interaction.errors?.some((error) => /recitation/i.test(`${error.code ?? ''} ${error.message ?? ''}`))) {
    throw new RecitationBlockedError();
  }
  if (interaction.status !== 'completed' && interaction.status !== 'incomplete') {
    console.warn(`[research] Gemini interaction ended with status ${interaction.status || 'unknown'}`);
    throw researchFailed();
  }
  return interaction;
}

export interface GroundedOutput {
  /** The model's final text, all `model_output` text blocks joined. */
  text: string;
  /**
   * Pages Google Search returned: `google_search_result` items, plus `url_citation` annotations that are Google's
   * search redirect links or repeat a search result.
   */
  searchSources: Array<{ url: string; title: string | null }>;
  /** Google Search suggestions widget HTML. Google's terms require showing it when present. */
  searchSuggestionsHtml: string | null;
  /**
   * Pages the model chose itself: URL-context reads and citations search didn't return. They count only under the
   * model-named URL rules.
   */
  modelNamedUrls: string[];
}

/** Pulls text, search sources, suggestions, and model-named pages out of an interaction's steps. */
export function readInteraction(interaction: Interaction): GroundedOutput {
  const texts: string[] = [];
  const searchSources = new Map<string, string | null>();
  const suggestions = new Set<string>();
  const modelNamed = new Set<string>();
  const citations: Array<{ url: string; title: string | undefined }> = [];
  const isWebUrl = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url);
  const addSource = (url: string, title: string | undefined) => {
    if (!searchSources.get(url)) searchSources.set(url, title?.trim() || null);
  };

  for (const raw of interaction.steps ?? []) {
    const parsed = stepSchema.safeParse(raw);
    if (!parsed.success) continue; // thoughts, tool calls, and other steps carry nothing we use
    const step = parsed.data;
    if (step.type === 'model_output') {
      for (const block of step.content ?? []) {
        if (block.type !== 'text' || block.text === undefined) continue;
        texts.push(block.text);
        for (const note of block.annotations ?? []) {
          if (note.type === 'url_citation' && isWebUrl(note.url)) citations.push({ url: note.url, title: note.title });
        }
      }
    } else if (step.type === 'google_search_result') {
      for (const item of step.result ?? []) {
        if (item.search_suggestions?.trim()) suggestions.add(item.search_suggestions);
        if (isWebUrl(item.url)) addSource(item.url, item.title);
      }
    } else {
      for (const item of step.result ?? []) {
        if (isWebUrl(item.url) && item.status !== 'error' && item.status !== 'unsafe') modelNamed.add(item.url);
      }
    }
  }
  // Citations are sorted only after every search result is known, whatever order the steps came in.
  for (const citation of citations) {
    if (isSearchRedirect(citation.url) || searchSources.has(citation.url)) addSource(citation.url, citation.title);
    else modelNamed.add(citation.url);
  }
  for (const url of searchSources.keys()) modelNamed.delete(url);

  return {
    text: texts.join('\n').trim(),
    searchSources: [...searchSources].map(([url, title]) => ({ url, title })),
    searchSuggestionsHtml: suggestions.size ? [...suggestions].join('\n') : null,
    modelNamedUrls: [...modelNamed],
  };
}
