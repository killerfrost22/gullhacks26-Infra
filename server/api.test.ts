import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/sha';
import type { Challenge } from 'altcha-lib';
import { createApp, researchRateLimit, trustProxySetting } from './index.js';
import { createCaptchaVerifier } from './captcha.js';
import { ApiError } from './errors.js';
import { parseCoordinate, parseInvestigationRequest } from './validation.js';
import type { LocationContext } from '../shared/types.js';

const validInput = {
  photoDataUrl: 'data:image/jpeg;base64,/9j/2Q==',
  location: { latitude: 0, longitude: 0, label: 'Confirmed location', address: null },
  details: '',
};

test('zero and world coordinate boundaries are valid; missing and nonfinite coordinates are not', () => {
  assert.equal(parseCoordinate('0', 'latitude'), 0);
  assert.equal(parseCoordinate('-90', 'latitude'), -90);
  assert.equal(parseCoordinate('90', 'latitude'), 90);
  assert.equal(parseCoordinate('-180', 'longitude'), -180);
  assert.equal(parseCoordinate('180', 'longitude'), 180);
  for (const value of ['', ' ', 'NaN', 'Infinity', '90.1', undefined, ['0']]) {
    assert.throws(() => parseCoordinate(value, 'latitude'));
  }
  assert.deepEqual(parseInvestigationRequest(validInput).location, validInput.location);
  assert.throws(() => parseInvestigationRequest({ ...validInput, photoDataUrl: 'data:image/svg+xml;base64,AAAA' }));
  assert.equal(parseInvestigationRequest({ ...validInput, details: `  ${'x'.repeat(1500)}  ` }).details.length, 1500);
  assert.throws(() => parseInvestigationRequest({ ...validInput, details: 'x'.repeat(1501) }));
  assert.throws(() => parseInvestigationRequest({ ...validInput, issueType: 'pothole', notes: '', campus: '' }), 'Removed fields are rejected.');
  assert.throws(() => parseInvestigationRequest({ photoDataUrl: validInput.photoDataUrl, location: validInput.location }));
  assert.throws(() => parseInvestigationRequest({ ...validInput, location: { ...validInput.location, longitude: 180.1 } }));
});

async function withApi(
  run: (base: string) => Promise<void>,
  options: NonNullable<Parameters<typeof createApp>[0]> = {},
  configured = true,
) {
  const previousKey = process.env.GEMINI_API_KEY;
  if (configured) process.env.GEMINI_API_KEY = 'isolated-api-test-key';
  else delete process.env.GEMINI_API_KEY;
  const server = createApp({ research: async () => { assert.fail('Unexpected model research call.'); }, ...options }).listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeIdleConnections(); });
  }
}

async function solveApiChallenge(base: string) {
  const response = await fetch(`${base}/api/captcha/challenge`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const challenge = await response.json() as Challenge;
  const solution = await solveChallenge({ challenge, deriveKey });
  assert.ok(solution, 'The official solver must solve an API-issued challenge.');
  return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
}

test('API reports setup honestly, preserves origin/content-type safeguards, and keeps unknown APIs JSON', async () => {
  await withApi(async (base) => {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { researchConfigured: boolean }).researchConfigured, false);
    const token = await solveApiChallenge(base);
    const setup = await fetch(`${base}/api/investigate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Captcha-Token': token }, body: JSON.stringify(validInput) });
    assert.equal(setup.status, 503);
    assert.equal((await setup.json() as { code: string }).code, 'RESEARCH_NOT_CONFIGURED');
    const crossSite = await fetch(`${base}/api/investigate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example.org' }, body: JSON.stringify(validInput) });
    assert.equal(crossSite.status, 403);
    assert.equal((await crossSite.json() as { code: string }).code, 'ORIGIN_NOT_ALLOWED');
    const fetchCrossSite = await fetch(`${base}/api/investigate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'Sec-Fetch-Site': 'cross-site' }, body: JSON.stringify(validInput) });
    assert.equal(fetchCrossSite.status, 403);
    const wrongType = await fetch(`${base}/api/investigate`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: base }, body: JSON.stringify(validInput) });
    assert.equal(wrongType.status, 415);
    const unknown = await fetch(`${base}/api/not-a-real-endpoint`, { headers: { Accept: 'text/html' } });
    assert.equal(unknown.status, 404);
    assert.match(unknown.headers.get('content-type') || '', /application\/json/);
    const invalidCoordinates = await fetch(`${base}/api/locations/reverse?lat=&lon=0`);
    assert.equal(invalidCoordinates.status, 400);
    const malformed = await fetch(`${base}/api/investigate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{bad' });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json() as { code: string }).code, 'INVALID_JSON');
  }, {}, false);
});

test('missing, malformed, forged, and expired CAPTCHA proofs never reach research', async () => {
  let timestamp = Date.now();
  const captcha = createCaptchaVerifier({ secret: 'api-security-test-secret', now: () => timestamp });
  await withApi(async (base) => {
    const post = (token?: string) => fetch(`${base}/api/investigate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...(token ? { 'X-Captcha-Token': token } : {}) }, body: JSON.stringify(validInput),
    });
    const missing = await post();
    assert.equal(missing.status, 403);
    assert.equal((await missing.json() as { code: string }).code, 'CAPTCHA_REQUIRED');
    const malformed = await post('forged-token');
    assert.equal(malformed.status, 403);
    assert.equal((await malformed.json() as { code: string }).code, 'CAPTCHA_INVALID');
    const token = await solveApiChallenge(base);
    const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8')) as { challenge: Challenge; solution: { derivedKey: string } };
    payload.solution.derivedKey = '0'.repeat(64);
    const forged = await post(Buffer.from(JSON.stringify(payload)).toString('base64'));
    assert.equal(forged.status, 403);
    assert.equal((await forged.json() as { code: string }).code, 'CAPTCHA_INVALID');
    timestamp = payload.challenge.parameters.expiresAt! * 1000;
    const expired = await post(token);
    assert.equal(expired.status, 403);
    assert.equal((await expired.json() as { code: string }).code, 'CAPTCHA_INVALID');
  }, { captcha });
});

test('only one submission of a real proof reaches research, including concurrent requests', async () => {
  let calls = 0;
  await withApi(async (base) => {
    const post = (token: string) => fetch(`${base}/api/investigate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Captcha-Token': token }, body: JSON.stringify(validInput),
    });
    const firstToken = await solveApiChallenge(base);
    const accepted = await post(firstToken);
    assert.equal((await accepted.json() as { code: string }).code, 'ISOLATED_RESEARCH_REACHED');
    assert.equal(calls, 1);
    const replayed = await post(firstToken);
    assert.equal(replayed.status, 403);
    assert.equal((await replayed.json() as { code: string }).code, 'CAPTCHA_INVALID');
    const nextToken = await solveApiChallenge(base);
    const concurrent = await Promise.all([post(nextToken), post(nextToken), post(nextToken)]);
    assert.equal(concurrent.filter((response) => response.status === 503).length, 1);
    assert.equal(concurrent.filter((response) => response.status === 403).length, 2);
    assert.equal(calls, 2);
    for (const response of concurrent) {
      assert.equal((await response.json() as { code: string }).code, response.status === 503 ? 'ISOLATED_RESEARCH_REACHED' : 'CAPTCHA_INVALID');
    }
  }, { research: async () => { calls++; throw new ApiError(503, 'Isolated model boundary reached.', 'ISOLATED_RESEARCH_REACHED'); } });
});

test('challenge issuance is rate limited per network address', async () => {
  await withApi(async (base) => {
    for (let index = 0; index < 20; index++) {
      const response = await fetch(`${base}/api/captcha/challenge`);
      assert.equal(response.status, 200);
      await response.json();
    }
    const limited = await fetch(`${base}/api/captcha/challenge`);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json() as { code: string }).code, 'CAPTCHA_RATE_LIMITED');
  });
});

test('research remains rate limited even when callers omit CAPTCHA proofs', async () => {
  await withApi(async (base) => {
    for (let index = 0; index < 5; index++) {
      const response = await fetch(`${base}/api/investigate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(validInput) });
      assert.equal(response.status, 403);
      await response.json();
    }
    const limited = await fetch(`${base}/api/investigate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(validInput) });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json() as { code: string }).code, 'RESEARCH_RATE_LIMITED');
  });
});

test('location context is served from the injected server-side lookup and validates coordinates first', async () => {
  const context: LocationContext = {
    road: { name: 'Campus Drive', ref: null, kind: 'tertiary', operator: null }, campus: null, streetLights: [],
    place: { municipality: 'College Park', county: "Prince George's County", state: 'Maryland', country: 'United States', countryCode: 'us' },
  };
  const lookups: [number, number][] = [];
  await withApi(async (base) => {
    const response = await fetch(`${base}/api/locations/context?lat=38.9886&lon=-76.9365`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { context });
    assert.deepEqual(lookups, [[38.9886, -76.9365]]);
    const invalid = await fetch(`${base}/api/locations/context?lat=91&lon=0`);
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json() as { code: string }).code, 'INVALID_COORDINATES');
    assert.equal(lookups.length, 1);
  }, { locationContext: async (latitude, longitude) => { lookups.push([latitude, longitude]); return context; } });
});

test('TRUST_PROXY and RESEARCH_RATE_LIMIT parse strictly and drive proxy trust and the research limit', async () => {
  assert.equal(trustProxySetting(undefined), false);
  assert.equal(trustProxySetting('false'), false);
  assert.equal(trustProxySetting('true'), true);
  assert.equal(trustProxySetting('1'), 1);
  assert.throws(() => trustProxySetting('yes'));
  assert.equal(researchRateLimit(undefined), 5);
  assert.equal(researchRateLimit('40'), 40);
  for (const value of ['0', '-1', '2.5', 'many', '10001']) assert.throws(() => researchRateLimit(value), value);
  const previous = { proxy: process.env.TRUST_PROXY, limit: process.env.RESEARCH_RATE_LIMIT };
  process.env.TRUST_PROXY = '1';
  process.env.RESEARCH_RATE_LIMIT = '2';
  try {
    await withApi(async (base) => {
      const post = (client: string) => fetch(`${base}/api/investigate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Forwarded-For': client }, body: JSON.stringify(validInput),
      });
      for (const status of [403, 403, 429]) {
        const response = await post('203.0.113.7');
        assert.equal(response.status, status);
        const body = await response.json() as { code: string; error: string };
        if (status === 429) assert.match(body.error, /2 requests per 15 minutes/);
      }
      const otherClient = await post('198.51.100.9');
      assert.equal(otherClient.status, 403, 'Behind a trusted proxy, each client address has its own limit.');
      await otherClient.json();
    });
  } finally {
    if (previous.proxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous.proxy;
    if (previous.limit === undefined) delete process.env.RESEARCH_RATE_LIMIT;
    else process.env.RESEARCH_RATE_LIMIT = previous.limit;
  }
});
