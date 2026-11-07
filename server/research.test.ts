import test from 'node:test';
import assert from 'node:assert/strict';
import type { InvestigationRequest, LocationContext } from '../shared/types.js';
import { investigate } from './research.js';

const redirectUrl = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQRegressionToken';
// `.invalid` never resolves, so page verification fails fast and offline; routing must still keep its source.
const realUrl = 'https://www.roads.example.invalid/258/How-to-Report-An-Issue';
const quote = 'Campus Drive between Route 1 and River Road is maintained by the State Highway Administration.';
const input: InvestigationRequest = {
  photoDataUrl: 'data:image/jpeg;base64,/9j/2Q==',
  location: { latitude: 38.9886, longitude: -76.9365, label: 'Campus Drive, College Park, Maryland', address: null },
  details: 'On Campus Drive just inside the North Gate, eastbound lane.',
};
const context: LocationContext = {
  road: { name: 'Campus Drive', ref: null, kind: 'tertiary', operator: null },
  campus: { name: 'University of Maryland', operator: null, website: 'https://umd.edu/' },
  streetLights: [],
  place: { municipality: 'College Park', county: "Prince George's County", state: 'Maryland', country: 'United States', countryCode: 'us' },
};
const report = {
  issue: {
    type: 'pothole', title: 'Pothole in travel lane', summary: 'There’s a pothole in the eastbound lane.', observations: [],
    photoLooksLikeDaytime: true, detailsSayLightIsOut: false,
  },
  responsibility: {
    status: 'source_supported', organization: 'State Highway Administration', department: null, email: null, emailSourceUrl: null,
    phone: null, phoneSourceUrl: null, reportingUrl: realUrl, reason: 'College Park lists Campus Drive as a state road.',
    coverageSourceUrl: realUrl, coverageQuote: quote,
  },
  sources: [{ title: 'How to Report An Issue', url: realUrl, note: 'Lists who maintains each road.', isOfficial: true }],
  warnings: [],
};

const recitationBlock = { error: { message: 'Request blocked due to copyright/recitation content. Please modify your input and retry.', code: 'The generated content was filtered because it may contain material that resembles existing copyrighted works.' } };

async function withMockedFetch(
  run: (calls: { url: string; body: Record<string, unknown> | null; redirect?: string }[]) => Promise<void>,
  { blockFirstGeminiCall = false } = {},
) {
  const calls: { url: string; body: Record<string, unknown> | null; redirect?: string }[] = [];
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'isolated-research-test-key';
  let blocked = !blockFirstGeminiCall;
  globalThis.fetch = (async (resource: string | URL | Request, init?: RequestInit) => {
    const url = String(resource);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null;
    calls.push({ url, body, redirect: init?.redirect });
    if (url === redirectUrl) return new Response(null, { status: 302, headers: { Location: realUrl } });
    if (!url.startsWith('https://generativelanguage.googleapis.com/')) throw new Error(`Unexpected fetch: ${url}`);
    if (!blocked) {
      blocked = true;
      return new Response(JSON.stringify(recitationBlock), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const geminiCalls = calls.filter((call) => call.url.startsWith('https://generativelanguage.googleapis.com/')).length - (blockFirstGeminiCall ? 1 : 0);
    const payload = geminiCalls === 1 ? {
      status: 'completed',
      steps: [
        { type: 'google_search_call', id: 'search-1', arguments: { queries: ['who maintains Campus Drive College Park MD'] } },
        { type: 'google_search_result', call_id: 'search-1', result: [{ search_suggestions: '<div>suggestions</div>' }] },
        { type: 'model_output', content: [{
          type: 'text', text: `College Park: "${quote}" ([How to Report An Issue](${redirectUrl}))`,
          annotations: [{ type: 'url_citation', url: redirectUrl, title: 'roads.example.invalid' }],
        }] },
      ],
    } : { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(report) }] }] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try { await run(calls); }
  finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
}

test('regression: a search citation behind a grounding redirect reaches the formatter and the report as the real page', async () => {
  await withMockedFetch(async (calls) => {
    const result = await investigate(input, new AbortController().signal, async () => context);
    const redirect = calls.filter((call) => call.url === redirectUrl);
    assert.equal(redirect.length, 1, 'Each grounding redirect is resolved with exactly one request.');
    assert.equal(redirect[0].redirect, 'manual');
    const [researchCall, formatCall] = calls.filter((call) => call.url.startsWith('https://generativelanguage.googleapis.com/'));
    const researchFacts = JSON.parse(((researchCall.body?.input as { text?: string }[])[0].text) || '{}') as Record<string, unknown>;
    assert.deepEqual(researchFacts.mapContext, context);
    assert.equal(researchFacts.details, input.details);
    const formatFacts = JSON.parse(((formatCall.body?.input as { text: string }[])[0].text)) as { allowedSourceUrls: string[]; researchBrief: string };
    assert.deepEqual(formatFacts.allowedSourceUrls, [realUrl]);
    assert.equal(formatFacts.researchBrief, `College Park: "${quote}" ([How to Report An Issue](${realUrl}))`);
    assert.notEqual(result.responsibility.status, 'unresolved');
    assert.equal(result.responsibility.organization, 'State Highway Administration');
    assert.equal(result.responsibility.reportingUrl, realUrl);
    assert.deepEqual(result.sources.map((source) => source.url), [realUrl]);
    assert.deepEqual(result.context, context);
    assert.equal(typeof result.timings.contextMs, 'number');
  });
});

test('a slow map lookup is capped so it cannot hold up research', async () => {
  await withMockedFetch(async () => {
    const startedAt = performance.now();
    const result = await investigate(input, new AbortController().signal, () => new Promise<LocationContext>(() => {}));
    assert.equal(result.context, null);
    assert.ok(result.timings.contextMs >= 1400 && result.timings.contextMs < 2500, `contextMs ${result.timings.contextMs}`);
    assert.ok(performance.now() - startedAt < 8000);
  });
});

test('a research answer blocked for recitation is retried once without quotes and still produces a report', async () => {
  await withMockedFetch(async (calls) => {
    const result = await investigate(input, new AbortController().signal, async () => context);
    const gemini = calls.filter((call) => call.url.startsWith('https://generativelanguage.googleapis.com/'));
    assert.equal(gemini.length, 3, 'blocked research, one research retry, then formatting');
    assert.ok(gemini[0].body?.tools && gemini[1].body?.tools, 'the retry repeats the research step, not formatting');
    assert.doesNotMatch(String(gemini[0].body?.system_instruction), /RETRY/);
    assert.match(String(gemini[1].body?.system_instruction), /Copy no text from any page/);
    assert.equal(result.responsibility.organization, 'State Highway Administration');
    assert.notEqual(result.responsibility.status, 'source_supported', 'without a verified quote the office is likely, not confirmed');
  }, { blockFirstGeminiCall: true });
});
