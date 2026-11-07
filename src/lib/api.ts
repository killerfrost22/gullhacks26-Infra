/** A failed API call, carrying the server's machine-readable `code` when it sent one. */
export class RequestError extends Error {
  constructor(message: string, readonly code: string | null, readonly status: number) {
    super(message);
  }
}

export async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (cause) {
    if (options?.signal?.aborted) throw cause;
    // fetch only rejects (other than aborts) when no HTTP response arrived at all.
    throw new RequestError('Can’t reach the server. Check your connection and try again.', 'NETWORK', 0);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RequestError('The server sent back something unreadable. Is it running?', null, response.status);
  }
  if (!response.ok) {
    const body = payload && typeof payload === 'object' ? payload as { error?: unknown; code?: unknown } : {};
    throw new RequestError(
      typeof body.error === 'string' ? body.error : `The request failed (${response.status}).`,
      typeof body.code === 'string' ? body.code : null,
      response.status,
    );
  }
  return payload as T;
}
