import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { CAPTCHA_HEADER, type Investigation, type InvestigationRequest } from '../../shared/types';
import { ApiRequestError, fetchHealth, requestInvestigation, reversePlace, searchPlaces } from './api';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** Replaces fetch; `respond` answers each call in order. */
function fakeFetch(respond: (call: Call, index: number) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return respond(call, calls.length - 1);
  }) as typeof fetch;
  return calls;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const isCode = (code: string, status?: number) => (error: unknown) =>
  error instanceof ApiRequestError && error.code === code && (status === undefined || error.status === status);

const request: InvestigationRequest = {
  photoDataUrl: 'data:image/jpeg;base64,AAAA',
  location: { latitude: 38.98, longitude: -76.93, label: 'Campus Drive', address: null },
  details: '',
};

const investigation = { issue: { title: 'Pothole' } } as Investigation;

describe('JSON helpers', () => {
  test('an `{ error, code }` body becomes an ApiRequestError with that code', async () => {
    fakeFetch(() => json({ error: 'Address lookup is down.', code: 'GEOCODER_UNAVAILABLE' }, 502));
    await assert.rejects(searchPlaces('campus drive'), isCode('GEOCODER_UNAVAILABLE', 502));
  });

  test('a body that is not ours falls back to the status', async () => {
    fakeFetch(() => new Response('<html>Bad Gateway</html>', { status: 502 }));
    await assert.rejects(fetchHealth(), isCode('INTERNAL_ERROR', 502));
    fakeFetch(() => json({ error: 'nope', code: 'SOMETHING_ELSE' }, 429));
    await assert.rejects(fetchHealth(), isCode('RATE_LIMITED', 429));
  });

  test('a network failure is NETWORK_ERROR with status 0', async () => {
    fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    await assert.rejects(fetchHealth(), isCode('NETWORK_ERROR', 0));
  });

  test('aborting is ABORTED, before or during the request', async () => {
    fakeFetch(() => json({ researchConfigured: true }));
    await assert.rejects(fetchHealth(AbortSignal.abort()), isCode('ABORTED', 0));

    const controller = new AbortController();
    fakeFetch(
      (call) =>
        new Promise<Response>((_, reject) => {
          call.init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const pending = fetchHealth(controller.signal);
    controller.abort();
    await assert.rejects(pending, isCode('ABORTED', 0));
  });

  test('reversePlace accepts a null body and sends lat/lon', async () => {
    const calls = fakeFetch(() => json(null));
    assert.equal(await reversePlace({ latitude: 38.98, longitude: -76.93 }), null);
    assert.equal(calls[0].url, '/api/locations/reverse?lat=38.98&lon=-76.93');
  });

  test('searchPlaces encodes the query', async () => {
    const calls = fakeFetch(() => json([]));
    assert.deepEqual(await searchPlaces('4306 Campus Dr & Regents'), []);
    assert.equal(calls[0].url, '/api/locations/search?q=4306+Campus+Dr+%26+Regents');
  });
});

describe('requestInvestigation', () => {
  const challengeFor = (index: number) => ({ id: `n${index}` });
  const solveCaptcha = async (challenge: unknown) => `token-${JSON.stringify(challenge)}`;

  test('solves the challenge and sends the token header', async () => {
    const calls = fakeFetch((call, index) => (call.url === '/api/captcha/challenge' ? json(challengeFor(index)) : json(investigation)));
    assert.deepEqual(await requestInvestigation(request, undefined, { solveCaptcha }), investigation);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].init?.method, 'POST');
    assert.equal(new Headers(calls[1].init?.headers).get(CAPTCHA_HEADER), 'token-{"id":"n0"}');
    assert.deepEqual(JSON.parse(String(calls[1].init?.body)), request);
  });

  test('retries once with a fresh challenge after CAPTCHA_INVALID', async () => {
    let posts = 0;
    const calls = fakeFetch((call, index) => {
      if (call.url === '/api/captcha/challenge') return json(challengeFor(index));
      posts++;
      return posts === 1 ? json({ error: 'Bot check failed.', code: 'CAPTCHA_INVALID' }, 403) : json(investigation);
    });
    assert.deepEqual(await requestInvestigation(request, undefined, { solveCaptcha }), investigation);
    assert.deepEqual(
      calls.map((call) => call.url),
      ['/api/captcha/challenge', '/api/investigate', '/api/captcha/challenge', '/api/investigate'],
    );
    assert.equal(new Headers(calls[3].init?.headers).get(CAPTCHA_HEADER), 'token-{"id":"n2"}', 'the retry uses the fresh challenge');
  });

  test('a second CAPTCHA_INVALID surfaces', async () => {
    const calls = fakeFetch((call, index) =>
      call.url === '/api/captcha/challenge' ? json(challengeFor(index)) : json({ error: 'Bot check failed.', code: 'CAPTCHA_INVALID' }, 403),
    );
    await assert.rejects(requestInvestigation(request, undefined, { solveCaptcha }), isCode('CAPTCHA_INVALID', 403));
    assert.equal(calls.length, 4);
  });

  test('other errors are not retried', async () => {
    const calls = fakeFetch((call, index) =>
      call.url === '/api/captcha/challenge'
        ? json(challengeFor(index))
        : json({ error: 'Too many reports.', code: 'RESEARCH_RATE_LIMITED' }, 429),
    );
    await assert.rejects(requestInvestigation(request, undefined, { solveCaptcha }), isCode('RESEARCH_RATE_LIMITED', 429));
    assert.equal(calls.length, 2);
  });

  test('a solver failure is CAPTCHA_INVALID; aborting while solving is ABORTED', async () => {
    fakeFetch(() => json(challengeFor(0)));
    const failing = async () => {
      throw new Error('timed out');
    };
    await assert.rejects(requestInvestigation(request, undefined, { solveCaptcha: failing }), isCode('CAPTCHA_INVALID', 0));

    const controller = new AbortController();
    const calls = fakeFetch(() => json(challengeFor(0)));
    let solving!: () => void;
    const started = new Promise<void>((resolve) => (solving = resolve));
    const slow = (_: unknown, signal?: AbortSignal) => {
      solving();
      return new Promise<string>((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    };
    const pending = requestInvestigation(request, controller.signal, { solveCaptcha: slow });
    await started;
    controller.abort();
    await assert.rejects(pending, isCode('ABORTED', 0));
    assert.equal(calls.length, 1, 'nothing is posted after cancelling');
  });
});
