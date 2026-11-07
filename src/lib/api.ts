import {
  API_ERROR_CODES,
  CAPTCHA_HEADER,
  type ApiErrorCode,
  type Coordinates,
  type Health,
  type Investigation,
  type InvestigationRequest,
  type LocationContext,
  type Place,
} from '../../shared/types';
import { solveCaptchaInWorker, type CaptchaSolver } from './captcha';

export type ApiRequestErrorCode = ApiErrorCode | 'NETWORK_ERROR' | 'ABORTED';

/** A failed API call. Show it with `messageFor` from `./messages`. */
export class ApiRequestError extends Error {
  /** HTTP status, or 0 when no response arrived (network failure, cancel, or the bot check failed on the device). */
  readonly status: number;
  readonly code: ApiRequestErrorCode;

  constructor(status: number, message: string, code: ApiRequestErrorCode) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

const KNOWN_CODES: ReadonlySet<string> = new Set(API_ERROR_CODES);

// Used when the body isn't our `{ error, code }` shape, e.g. a proxy page in front of the API.
function codeForStatus(status: number): ApiErrorCode {
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500) return 'INTERNAL_ERROR';
  return 'INVALID_REQUEST';
}

function errorFromBody(status: number, text: string): ApiRequestError {
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON; fall back to the status code.
  }
  const { error, code } = (body ?? {}) as { error?: unknown; code?: unknown };
  if (typeof code === 'string' && KNOWN_CODES.has(code)) {
    return new ApiRequestError(status, typeof error === 'string' ? error : code, code as ApiErrorCode);
  }
  return new ApiRequestError(status, `Request failed with status ${status}`, codeForStatus(status));
}

const aborted = () => new ApiRequestError(0, 'The request was cancelled.', 'ABORTED');

async function requestJson<T>(path: string, init: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const { signal } = init;
  if (signal?.aborted) throw aborted();
  let status: number;
  let ok: boolean;
  let text: string;
  try {
    const response = await fetch(path, { ...init, headers: { Accept: 'application/json', ...init.headers } });
    ({ status, ok } = response);
    text = await response.text();
  } catch {
    if (signal?.aborted) throw aborted();
    throw new ApiRequestError(0, 'The server could not be reached.', 'NETWORK_ERROR');
  }
  if (!ok) throw errorFromBody(status, text);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiRequestError(status, 'The server sent an unreadable response.', 'INTERNAL_ERROR');
  }
}

const pointQuery = (point: Coordinates) =>
  new URLSearchParams({ lat: String(point.latitude), lon: String(point.longitude) }).toString();

export function fetchHealth(signal?: AbortSignal): Promise<Health> {
  return requestJson<Health>('/api/health', { signal });
}

export function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  return requestJson<Place[]>(`/api/locations/search?${new URLSearchParams({ q: query })}`, { signal });
}

/** `null` when the geocoder has no address for the point. */
export function reversePlace(point: Coordinates, signal?: AbortSignal): Promise<Place | null> {
  return requestJson<Place | null>(`/api/locations/reverse?${pointQuery(point)}`, { signal });
}

export function fetchLocationContext(point: Coordinates, signal?: AbortSignal): Promise<LocationContext> {
  return requestJson<LocationContext>(`/api/locations/context?${pointQuery(point)}`, { signal });
}

export interface InvestigationOptions {
  /** Test seam. Defaults to solving in a Web Worker. */
  solveCaptcha?: CaptchaSolver;
}

/** Gets and solves a captcha challenge, sends the token; on CAPTCHA_INVALID retries once with a fresh challenge. */
export async function requestInvestigation(
  request: InvestigationRequest,
  signal?: AbortSignal,
  options: InvestigationOptions = {},
): Promise<Investigation> {
  const solve = options.solveCaptcha ?? solveCaptchaInWorker;
  const body = JSON.stringify(request);
  for (let attempt = 1; ; attempt++) {
    const challenge = await requestJson<unknown>('/api/captcha/challenge', { signal });
    let token: string;
    try {
      token = await solve(challenge, signal);
    } catch (error) {
      if (signal?.aborted) throw aborted();
      throw new ApiRequestError(0, error instanceof Error ? error.message : 'Bot check failed.', 'CAPTCHA_INVALID');
    }
    if (signal?.aborted) throw aborted();
    try {
      return await requestJson<Investigation>('/api/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CAPTCHA_HEADER]: token },
        body,
        signal,
      });
    } catch (error) {
      // Tokens are single-use and expire; one fresh challenge covers a stale or raced token.
      if (attempt === 1 && error instanceof ApiRequestError && error.code === 'CAPTCHA_INVALID') continue;
      throw error;
    }
  }
}
