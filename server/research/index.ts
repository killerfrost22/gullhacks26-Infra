import type { Investigation, InvestigationRequest } from '../../shared/types.js';
import { createPinnedTransport, PAGE_TIMEOUT_MS, systemResolver } from './fetch-page.js';
import { BUDGET_MS, CONTEXT_WAIT_MS, runInvestigation, type InvestigateOptions } from './pipeline.js';

export type { InvestigateOptions } from './pipeline.js';

/** True when a Gemini key is set. Drives `GET /api/health`. */
export function researchConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GEMINI_API_KEY?.trim());
}

const pageTransport = createPinnedTransport(systemResolver);

/**
 * Pin + note, with or without a photo → who maintains it, with every source, quote, and contact checked on a page
 * loaded now. Without a photo (`photoDataUrl: null`) the note is the only description, and nothing mentions a photo.
 * Throws ApiError RESEARCH_UNAVAILABLE / RESEARCH_QUOTA / RESEARCH_FAILED, or the caller's abort reason.
 */
export function investigate(request: InvestigationRequest, options: InvestigateOptions = {}): Promise<Investigation> {
  return runInvestigation(request, options, {
    env: process.env,
    fetch: (input, init) => globalThis.fetch(input, init),
    resolve: systemResolver,
    pageTransport,
    now: () => new Date(),
    contextWaitMs: CONTEXT_WAIT_MS,
    budgetMs: BUDGET_MS,
    pageTimeoutMs: PAGE_TIMEOUT_MS,
  });
}
