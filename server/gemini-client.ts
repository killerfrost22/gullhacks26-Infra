import { ApiError } from './errors.js';

/** Provider messages may contain request data; return only classified, public-safe errors. */
export function geminiProviderError(status: number, payload: unknown): ApiError {
  const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
  const message = typeof error === 'string' ? error
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : '';
  const details = error && typeof error === 'object' && 'details' in error ? error.details : undefined;
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  const invalidKey = Array.isArray(details) && details.some((item: unknown) => item && typeof item === 'object'
    && 'reason' in item && (item.reason === 'API_KEY_INVALID' || item.reason === 'API_KEY_EXPIRED'));
  if (status === 401 || status === 403 || invalidKey || /api[ _-]?key.*(?:not valid|invalid|expired|revoked)/i.test(message)) {
    return new ApiError(503, 'Gemini rejected the configured key or permissions. Check the server GEMINI_API_KEY and model access.', 'RESEARCH_AUTH_FAILED');
  }
  if (status === 429) return new ApiError(503, 'Gemini is rate limited or its quota is exhausted. Check the Google AI project billing and limits before trying again.', 'RESEARCH_QUOTA');
  if (/too many tool calls|tool.call limit|maximum number of tool calls/i.test(message)) {
    return new ApiError(502, 'Gemini exceeded its web-research tool limit before finishing the report. No report was generated.', 'RESEARCH_TOOL_LIMIT');
  }
  // Gemini refuses answers that repeat web text too closely. The research step retries once without quoting.
  if (/recitation|copyright/i.test(`${message} ${code}`)) {
    return new ApiError(502, 'Gemini blocked the answer for repeating web page text. No report was generated.', 'RESEARCH_RECITATION');
  }
  if (status === 404) return new ApiError(502, 'The configured Gemini model or API resource is unavailable. Check GEMINI_MODEL and this project’s model access.', 'RESEARCH_MODEL_ERROR');
  if (status === 400 || status === 422) return new ApiError(502, 'Gemini rejected the report-generation request. This does not necessarily mean the model is unsupported. No report was generated.', 'RESEARCH_REQUEST_REJECTED');
  return new ApiError(502, 'Gemini could not complete this request. No routing was assumed.', 'RESEARCH_UNAVAILABLE');
}

export async function requestGemini(body: Record<string, unknown>, apiKey: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal,
    redirect: 'error',
    body: JSON.stringify(body),
  });
  const reader = response.body?.getReader();
  if (!reader) {
    if (!response.ok) throw geminiProviderError(response.status, undefined);
    throw new ApiError(502, 'Gemini returned an empty response.', 'RESEARCH_INVALID_OUTPUT');
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 2_000_000) {
        await reader.cancel();
        throw new ApiError(502, 'Gemini returned an oversized response. No routing was assumed.', 'RESEARCH_INVALID_OUTPUT');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let payload: unknown;
  try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch {
    if (!response.ok) throw geminiProviderError(response.status, undefined);
    throw new ApiError(502, 'Gemini returned an unreadable response. No routing was assumed.', 'RESEARCH_INVALID_OUTPUT');
  }
  if (!response.ok) throw geminiProviderError(response.status, payload);
  return payload;
}
