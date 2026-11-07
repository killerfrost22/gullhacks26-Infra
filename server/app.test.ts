import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import type { Investigation, InvestigationRequest, LocationContext, Place } from '../shared/types.js';
import { createApp, type AppDeps } from './app.js';
import { ApiError } from './errors.js';

const JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString('base64')}`;

const PLACE: Place = { latitude: 38.9869, longitude: -76.9426, label: 'Campus Drive, College Park', address: null };

const CONTEXT: LocationContext = { road: null, campus: null, streetLights: [], area: null, partial: false };

const REPORT: Investigation = {
  issue: { kind: 'pothole', title: 'Pothole', summary: 'A pothole.', observations: [] },
  responsibility: {
    verdict: 'unidentified',
    organization: null,
    department: null,
    reason: 'No office could be identified.',
    evidence: null,
    reportingUrl: null,
    email: null,
    phone: null,
  },
  sources: [],
  warnings: [],
  searchSuggestionsHtml: null,
  context: null,
  generatedAt: '2026-11-07T20:00:00.000Z',
};

const REQUEST: InvestigationRequest = { photoDataUrl: JPEG_DATA_URL, location: PLACE, details: 'Right lane' };

const distDir = mkdtempSync(join(tmpdir(), 'fixplease-dist-'));
const INDEX_HTML = Buffer.from('<!doctype html><title>Fix Please</title><div id="root"></div>');
writeFileSync(join(distDir, 'index.html'), INDEX_HTML);
mkdirSync(join(distDir, 'assets'));
writeFileSync(join(distDir, 'assets', 'index-abc123.js'), 'console.log(1);');
// Repetitive text so compression clearly shrinks it.
const APP_JS = Buffer.from(Array.from({ length: 400 }, (_, i) => `export const value${i} = "fix please ${i}";`).join('\n'));
writeFileSync(join(distDir, 'assets', 'app-def456.js'), APP_JS);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
writeFileSync(join(distDir, 'icon.png'), PNG_BYTES);
writeFileSync(join(distDir, 'manifest.webmanifest'), JSON.stringify({ name: 'Fix Please', icons: [] }));
writeFileSync(join(distDir, '.env'), 'SECRET=never-served');
after(() => rmSync(distDir, { recursive: true, force: true }));

function fakeDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    config: { trustProxy: false, researchRateLimit: 5, distDir },
    captcha: {
      createChallenge: async () => ({ parameters: { algorithm: 'PBKDF2/SHA-256', nonce: 'n', salt: 's', cost: 1, keyLength: 32, keyPrefix: '00' }, signature: 'sig' }),
      verify: async (token) => token === 'good',
    },
    geo: {
      searchPlaces: async () => [PLACE, PLACE, PLACE, PLACE, PLACE, PLACE, PLACE],
      reversePlace: async () => null,
      getLocationContext: async () => CONTEXT,
    },
    research: {
      researchConfigured: () => true,
      investigate: async () => REPORT,
    },
    ...overrides,
  };
}

async function start(deps: AppDeps) {
  const server = createApp(deps).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return base;
}

function investigate(base: string, init: { origin?: string | null; token?: string | null; body?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const origin = init.origin === undefined ? base : init.origin;
  if (origin !== null) headers.Origin = origin;
  const token = init.token === undefined ? 'good' : init.token;
  if (token !== null) headers['X-Captcha-Token'] = token;
  return fetch(`${base}/api/investigate`, { method: 'POST', headers, body: init.body ?? JSON.stringify(REQUEST) });
}

async function expectError(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  const body = (await response.json()) as { error: unknown; code: unknown };
  assert.equal(body.code, code);
  assert.equal(typeof body.error, 'string');
  assert.ok((body.error as string).length > 0);
}

test('health reflects whether research is configured', async () => {
  for (const configured of [true, false]) {
    const base = await start(fakeDeps({ research: { researchConfigured: () => configured, investigate: async () => REPORT } }));
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { researchConfigured: configured });
  }
});

test('every response carries the security headers and no x-powered-by', async () => {
  const base = await start(fakeDeps());
  for (const path of ['/api/health', '/tech', '/api/x']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('permissions-policy'), 'camera=(self), geolocation=(self)');
    assert.equal(response.headers.get('x-powered-by'), null);
  }
});

test('investigate succeeds same-origin with a captcha, and research gets the validated request and a working map-facts lookup', async () => {
  const deps = fakeDeps();
  let seen: { request: InvestigationRequest; context: LocationContext | undefined; signal: unknown } | undefined;
  deps.research.investigate = async (request, options) => {
    const context = await options?.getContext?.(request.location, options.signal);
    seen = { request, context, signal: options?.signal };
    return REPORT;
  };
  const base = await start(deps);
  const response = await investigate(base);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), REPORT);
  assert.deepEqual(seen?.request, REQUEST);
  assert.deepEqual(seen?.context, CONTEXT);
  assert.ok(seen?.signal instanceof AbortSignal);
});

test('investigate rejects a missing or mismatched Origin before anything else', async () => {
  let calls = 0;
  const deps = fakeDeps();
  deps.research.investigate = async () => {
    calls += 1;
    return REPORT;
  };
  const base = await start(deps);
  await expectError(await investigate(base, { origin: null }), 403, 'FORBIDDEN_ORIGIN');
  await expectError(await investigate(base, { origin: 'https://evil.example.invalid' }), 403, 'FORBIDDEN_ORIGIN');
  await expectError(await investigate(base, { origin: base.replace('127.0.0.1', '127.0.0.2') }), 403, 'FORBIDDEN_ORIGIN');
  await expectError(await investigate(base, { origin: 'null' }), 403, 'FORBIDDEN_ORIGIN');
  assert.equal(calls, 0);
  assert.equal((await investigate(base, { origin: base })).status, 200);
  assert.equal(calls, 1);
});

test('investigate needs a valid captcha token', async () => {
  const base = await start(fakeDeps());
  await expectError(await investigate(base, { token: null }), 403, 'CAPTCHA_REQUIRED');
  await expectError(await investigate(base, { token: 'stale' }), 403, 'CAPTCHA_INVALID');
});

test('investigate validates the body', async () => {
  const base = await start(fakeDeps());
  const photo = { ...REQUEST, photoDataUrl: 'data:image/png;base64,' + JPEG_DATA_URL.split(',')[1] };
  await expectError(await investigate(base, { body: JSON.stringify(photo) }), 400, 'INVALID_PHOTO');
  const location = { ...REQUEST, location: { ...PLACE, latitude: 91 } };
  await expectError(await investigate(base, { body: JSON.stringify(location) }), 400, 'INVALID_LOCATION');
  const details = { ...REQUEST, details: 'x'.repeat(1501) };
  await expectError(await investigate(base, { body: JSON.stringify(details) }), 400, 'INVALID_REQUEST');
});

test('research errors keep their code and safe message', async () => {
  const deps = fakeDeps();
  deps.research.investigate = async () => {
    throw new ApiError(503, 'Report lookup is offline right now.', 'RESEARCH_UNAVAILABLE');
  };
  const base = await start(deps);
  const response = await investigate(base);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Report lookup is offline right now.', code: 'RESEARCH_UNAVAILABLE' });
});

test('an unexpected failure is a plain 500 INTERNAL_ERROR without details', async (t) => {
  const deps = fakeDeps();
  deps.research.investigate = async () => {
    throw new Error('provider said: key AIza-secret is invalid');
  };
  const logged: string[] = [];
  t.mock.method(console, 'error', (message: string) => logged.push(message));
  const base = await start(deps);
  const response = await investigate(base);
  await expectError(response.clone(), 500, 'INTERNAL_ERROR');
  assert.doesNotMatch(await response.text(), /AIza|provider/);
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0], /base64/);
});

test(`the research limit returns RESEARCH_RATE_LIMITED after RESEARCH_RATE_LIMIT requests`, async () => {
  const base = await start(fakeDeps({ config: { trustProxy: false, researchRateLimit: 3, distDir } }));
  for (let i = 0; i < 3; i += 1) assert.equal((await investigate(base)).status, 200);
  await expectError(await investigate(base), 429, 'RESEARCH_RATE_LIMITED');
});

test('location endpoints answer, cap search at 5 results, and rate limit at 30 per minute', async () => {
  const base = await start(fakeDeps());
  const search = await fetch(`${base}/api/locations/search?q=College%20Park`);
  assert.equal(search.status, 200);
  assert.equal(((await search.json()) as Place[]).length, 5);
  assert.equal(await (await fetch(`${base}/api/locations/reverse?lat=38.98&lon=-76.94`)).json(), null);
  assert.deepEqual(await (await fetch(`${base}/api/locations/context?lat=38.98&lon=-76.94`)).json(), CONTEXT);
  await expectError(await fetch(`${base}/api/locations/reverse?lat=95&lon=0`), 400, 'INVALID_LOCATION');
  await expectError(await fetch(`${base}/api/locations/search?q=a`), 400, 'INVALID_REQUEST');
  for (let i = 0; i < 28; i += 1) await (await fetch(`${base}/api/locations/search?q=ab`)).arrayBuffer();
  await expectError(await fetch(`${base}/api/locations/search?q=ab`), 429, 'RATE_LIMITED');
});

test('a body over 6 MB is 413 PAYLOAD_TOO_LARGE; other endpoints cap at 16 kB', async () => {
  const base = await start(fakeDeps());
  const huge = JSON.stringify({ ...REQUEST, photoDataUrl: 'x'.repeat(6 * 1024 * 1024) });
  await expectError(await investigate(base, { body: huge }), 413, 'PAYLOAD_TOO_LARGE');
  const response = await fetch(`${base}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(17 * 1024) }),
  });
  await expectError(response, 413, 'PAYLOAD_TOO_LARGE');
});

test('malformed JSON is 400 INVALID_REQUEST', async () => {
  const base = await start(fakeDeps());
  await expectError(await investigate(base, { body: '{"photoDataUrl": ' }), 400, 'INVALID_REQUEST');
});

test('unknown API paths are JSON 404s, never the app shell', async () => {
  const base = await start(fakeDeps());
  await expectError(await fetch(`${base}/api/x`), 404, 'NOT_FOUND');
  await expectError(await fetch(`${base}/api`), 404, 'NOT_FOUND');
  await expectError(await fetch(`${base}/api/health`, { method: 'DELETE' }), 404, 'NOT_FOUND');
});

test('the built app is served: client routes get index.html uncached, hashed assets are immutable', async () => {
  const base = await start(fakeDeps());
  for (const path of ['/', '/tech', '/privacy', '/some/deep/link']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.match(await response.text(), /<title>Fix Please<\/title>/);
  }
  const asset = await fetch(`${base}/assets/index-abc123.js`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  const missing = await fetch(`${base}/assets/index-gone.js`);
  assert.equal(missing.status, 404);
  assert.doesNotMatch(await missing.text(), /<title>/);
  assert.equal((await fetch(`${base}/tech`, { method: 'HEAD' })).status, 200);
});

test('without a build, non-API paths are not served', async () => {
  const base = await start(fakeDeps({ config: { trustProxy: false, researchRateLimit: 5, distDir: join(distDir, 'nope') } }));
  assert.equal((await fetch(`${base}/tech`)).status, 404);
  await expectError(await fetch(`${base}/api/x`), 404, 'NOT_FOUND');
});

test('a client that disconnects aborts the signal passed to investigate', { timeout: 5_000 }, async () => {
  const deps = fakeDeps();
  // tsconfig targets ES2023, which has no Promise.withResolvers.
  let markStarted!: () => void;
  let markAborted!: () => void;
  const started = new Promise<void>((resolve) => (markStarted = resolve));
  const aborted = new Promise<void>((resolve) => (markAborted = resolve));
  deps.research.investigate = (_request, options) =>
    new Promise<Investigation>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => {
        markAborted();
        reject(options.signal?.reason);
      });
      markStarted();
    });
  const base = await start(deps);
  const client = new AbortController();
  const request = fetch(`${base}/api/investigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, 'X-Captcha-Token': 'good' },
    body: JSON.stringify(REQUEST),
    signal: client.signal,
  }).catch((error: unknown) => error);
  await started;
  client.abort();
  await request;
  // Resolves only through the abort listener; the test timeout catches a signal that never fires.
  await aborted;
});

test('the captcha challenge endpoint returns the challenge uncached', async () => {
  const base = await start(fakeDeps());
  const response = await fetch(`${base}/api/captcha/challenge`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(((await response.json()) as { signature: string }).signature, 'sig');
});

interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** fetch decompresses on its own, so these tests read the bytes on the wire with node:http. */
function raw(url: string, headers: Record<string, string> = {}, method = 'GET'): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

test('built text files are sent with Brotli when accepted, and decompress to the exact file', async () => {
  const base = await start(fakeDeps());
  const response = await raw(`${base}/assets/app-def456.js`, { 'Accept-Encoding': 'gzip, deflate, br' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-encoding'], 'br');
  assert.match(response.headers['content-type'] ?? '', /^text\/javascript/);
  assert.match(response.headers.vary ?? '', /Accept-Encoding/i);
  assert.equal(response.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(Number(response.headers['content-length']), response.body.length);
  assert.ok(response.body.length < APP_JS.length / 4, `${response.body.length} bytes is not compressed`);
  assert.deepEqual(brotliDecompressSync(response.body), APP_JS);
  // Served from the in-memory cache the second time, byte for byte.
  assert.deepEqual((await raw(`${base}/assets/app-def456.js`, { 'Accept-Encoding': 'br' })).body, response.body);
});

test('gzip-only clients get gzip; clients without Accept-Encoding get the plain file', async () => {
  const base = await start(fakeDeps());
  const gzipped = await raw(`${base}/assets/app-def456.js`, { 'Accept-Encoding': 'gzip' });
  assert.equal(gzipped.headers['content-encoding'], 'gzip');
  assert.deepEqual(gunzipSync(gzipped.body), APP_JS);
  const refusesBrotli = await raw(`${base}/assets/app-def456.js`, { 'Accept-Encoding': 'br;q=0, gzip' });
  assert.equal(refusesBrotli.headers['content-encoding'], 'gzip');
  const plain = await raw(`${base}/assets/app-def456.js`);
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.match(plain.headers.vary ?? '', /Accept-Encoding/i);
  assert.equal(Number(plain.headers['content-length']), APP_JS.length);
  assert.deepEqual(plain.body, APP_JS);
});

test('the SPA fallback and other text files are compressed; HEAD has headers but no body', async () => {
  const base = await start(fakeDeps());
  const tech = await raw(`${base}/tech`, { 'Accept-Encoding': 'br' });
  assert.equal(tech.status, 200);
  assert.equal(tech.headers['content-encoding'], 'br');
  assert.equal(tech.headers['cache-control'], 'no-cache');
  assert.match(tech.headers['content-type'] ?? '', /^text\/html/);
  assert.deepEqual(brotliDecompressSync(tech.body), INDEX_HTML);

  const manifest = await raw(`${base}/manifest.webmanifest`, { 'Accept-Encoding': 'gzip' });
  assert.equal(manifest.headers['content-encoding'], 'gzip');
  assert.match(manifest.headers['content-type'] ?? '', /^application\/manifest\+json/);

  const head = await raw(`${base}/assets/app-def456.js`, { 'Accept-Encoding': 'br' }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.headers['content-encoding'], 'br');
  assert.ok(Number(head.headers['content-length']) > 0);
  assert.equal(head.body.length, 0);
});

test('images are not recompressed, revalidation gets 304, and dotfiles or traversal never leak files', async () => {
  const base = await start(fakeDeps());
  const png = await raw(`${base}/icon.png`, { 'Accept-Encoding': 'br, gzip' });
  assert.equal(png.status, 200);
  assert.equal(png.headers['content-encoding'], undefined);
  assert.deepEqual(png.body, PNG_BYTES);

  const first = await raw(`${base}/tech`, { 'Accept-Encoding': 'br' });
  const again = await raw(`${base}/tech`, { 'Accept-Encoding': 'br', 'If-None-Match': String(first.headers.etag) });
  assert.equal(again.status, 304);

  for (const path of ['/.env', '/%2e%2e/%2e%2e/package.json', '/assets/..%2f.env', '/assets/%2e%2e%5c.env']) {
    const response = await raw(`${base}${path}`, { 'Accept-Encoding': 'identity' });
    assert.doesNotMatch(response.body.toString(), /never-served|"dependencies"/, path);
  }
});

test('API responses are not compressed by the static file path', async () => {
  const base = await start(fakeDeps());
  const response = await raw(`${base}/api/health`, { 'Accept-Encoding': 'br, gzip' });
  assert.equal(response.headers['content-encoding'], undefined);
  assert.deepEqual(JSON.parse(response.body.toString()), { researchConfigured: true });
});
