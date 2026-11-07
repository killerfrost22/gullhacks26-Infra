import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { InvestigationRequest, LocationContext } from '../../shared/types.js';
import { ApiError } from '../errors.js';
import type { PageTransport, Resolver } from './fetch-page.js';
import { GEMINI_ENDPOINT } from './gemini.js';
import { investigate, researchConfigured } from './index.js';
import { runInvestigation, type ResearchDeps } from './pipeline.js';
import { NO_QUOTE_RETRY } from './prompt.js';
import type { Draft } from './schema.js';

// ---------------------------------------------------------------- fixtures

const KEY = 'test-key-not-real';
const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123';
const ROADS_PAGE = 'https://www.cityofexample.gov/public-works/roads';
const QUOTE = 'The Department of Public Works maintains all city streets inside the city limits, including Campus Drive.';
const SUGGESTIONS = '<div class="container"><a class="chip" href="https://www.google.com/search?q=campus+drive">campus drive</a></div>';

const request: InvestigationRequest = {
  photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP8=',
  location: {
    label: 'Campus Drive, College Park',
    latitude: 38.9886,
    longitude: -76.9365,
    address: {
      houseNumber: null,
      road: 'Campus Drive',
      locality: 'College Park',
      county: "Prince George's County",
      state: 'Maryland',
      postcode: '20742',
      country: 'United States',
      countryCode: 'us',
    },
  },
  details: 'Eastbound lane just inside the North Gate.',
};

const context: LocationContext = {
  road: { name: 'Campus Drive', ref: null, kind: 'secondary', operator: null, distanceMeters: 4 },
  campus: null,
  streetLights: [],
  area: {
    municipality: 'College Park',
    municipalityKind: 'city',
    incorporation: 'incorporated',
    county: "Prince George's County",
    state: 'Maryland',
    country: 'United States',
    countryCode: 'us',
  },
  partial: false,
};

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    issue: { kind: 'pothole', title: 'Pothole in the eastbound lane', summary: 'A deep pothole.', observations: ['Deep hole'] },
    organization: 'City of Example',
    department: 'Department of Public Works',
    reason: 'The city maintains streets inside its limits.',
    coverageQuote: QUOTE,
    coverageSource: 'S1',
    reportingPage: null,
    officialWebsite: null,
    email: null,
    emailSource: null,
    phone: null,
    phoneSource: null,
    sources: ['S1'],
    photoLooksDaytime: null,
    noteSaysLightIsOut: null,
    ...overrides,
  };
}

const roadsHtml = (extra = '') =>
  `<html><head><title>Roads | City of Example</title></head><body><main>
   <p>The Department of Public\u00a0Works maintains all city streets inside the city limits, including Campus\u00a0Drive.</p>
   <p>Questions? Call (301)\u00a0555-0100.</p>${extra}</main></body></html>`;

function researchInteraction(text: string, sources = [{ url: REDIRECT, title: 'cityofexample.gov' }]) {
  return {
    id: 'int_research',
    status: 'completed',
    steps: [
      { type: 'thought', signature: 'sig' },
      { type: 'google_search_call', id: 'c1', arguments: { queries: ['who maintains Campus Drive College Park'] } },
      {
        type: 'google_search_result',
        call_id: 'c1',
        result: [...sources, { search_suggestions: SUGGESTIONS }],
      },
      {
        type: 'model_output',
        content: [{ type: 'text', text, annotations: sources.map((s) => ({ type: 'url_citation', ...s, start_index: 0, end_index: 5 })) }],
      },
    ],
  };
}

const formatInteraction = (value: Draft) => ({
  id: 'int_format',
  status: 'completed',
  steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(value) }] }],
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const htmlResponse = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });

interface Harness {
  deps: ResearchDeps;
  geminiBodies: Array<Record<string, unknown>>;
  pageCalls: string[];
}

function harness(options: {
  research?: Array<() => Response>;
  format?: Array<() => Response>;
  pages?: Record<string, () => Response>;
  dns?: Record<string, string[]>;
}): Harness {
  const geminiBodies: Array<Record<string, unknown>> = [];
  const pageCalls: string[] = [];
  const research = options.research ?? [() => json(researchInteraction('ORGANIZATION: City of Example'))];
  const format = options.format ?? [() => json(formatInteraction(draft()))];
  let researchCall = 0;
  let formatCall = 0;
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), GEMINI_ENDPOINT);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    geminiBodies.push(body);
    if (body.response_format) return (format[formatCall++] ?? format[format.length - 1])();
    return (research[researchCall++] ?? research[research.length - 1])();
  }) as typeof fetch;
  const pages: Record<string, () => Response> = {
    [REDIRECT]: () => new Response(null, { status: 302, headers: { location: ROADS_PAGE } }),
    [ROADS_PAGE]: () => htmlResponse(roadsHtml()),
    ...options.pages,
  };
  const transport: PageTransport = async (url) => {
    pageCalls.push(url);
    const route = pages[url];
    if (!route) throw new TypeError('fetch failed');
    return route();
  };
  const dns = options.dns ?? {};
  const resolve: Resolver = async (hostname) => {
    if (hostname.endsWith('.invalid')) throw new Error('ENOTFOUND');
    return (dns[hostname] ?? ['93.184.216.34']).map((address) => ({ address, family: 4 }));
  };
  return {
    geminiBodies,
    pageCalls,
    deps: {
      env: { GEMINI_API_KEY: KEY },
      fetch: fakeFetch,
      resolve,
      pageTransport: transport,
      now: () => new Date('2026-11-07T20:00:00Z'),
      contextWaitMs: 200,
      budgetMs: 10_000,
      pageTimeoutMs: 1_000,
    },
  };
}

const withContext = { getContext: async () => context };

// ---------------------------------------------------------------- tests

describe('investigate pipeline', () => {
  it('confirms only with the coverage quote word for word on a loaded official page', async () => {
    const h = harness({});
    const result = await runInvestigation(request, withContext, h.deps);

    assert.equal(result.responsibility.verdict, 'confirmed');
    assert.equal(result.responsibility.organization, 'City of Example');
    assert.deepEqual(result.responsibility.evidence, { url: ROADS_PAGE, quote: QUOTE });
    assert.deepEqual(result.sources[0], {
      title: 'Roads | City of Example',
      url: ROADS_PAGE,
      note: 'Has the sentence that shows who covers this spot.',
      official: true,
    });
    assert.equal(result.searchSuggestionsHtml, SUGGESTIONS);
    assert.deepEqual(result.context, context);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.generatedAt, '2026-11-07T20:00:00.000Z');
    assert.ok(!JSON.stringify(result).includes(KEY));

    const [researchBody, formatBody] = h.geminiBodies;
    assert.equal(researchBody.store, false);
    assert.deepEqual(researchBody.tools, [{ type: 'google_search' }, { type: 'url_context' }]);
    const input = researchBody.input as Array<Record<string, string>>;
    assert.equal(input[1].type, 'image');
    assert.equal(input[1].mime_type, 'image/jpeg');
    assert.match(input[0].text, /"Eastbound lane just inside the North Gate\."/);
    assert.equal(formatBody.store, false);
    assert.equal(formatBody.tools, undefined);
  });

  it('downgrades to best match when the quote is not on the page', async () => {
    const h = harness({
      format: [() => json(formatInteraction(draft({ coverageQuote: 'The county maintains every road in this area of town.' })))],
    });
    const result = await runInvestigation(request, withContext, h.deps);
    assert.equal(result.responsibility.verdict, 'best_match');
    assert.equal(result.responsibility.evidence, null);
    assert.equal(result.responsibility.organization, 'City of Example');
    assert.ok(result.warnings.some((w) => w.startsWith('Best match. Worth a quick check')));
  });

  it('drops made-up URLs and model-named non-government pages search did not return, keeps a government page that loads', async () => {
    const madeUp = 'https://www.cityofexample.gov/report-a-pothole-that-does-not-exist';
    const blog = 'https://potholes-blog.example.com/college-park';
    const govForm = 'https://www.cityofexample.gov/report';
    const deadHost = 'https://made-up-agency.invalid/contact';
    const h = harness({
      research: [() => json(researchInteraction(`REPORTING_URL: ${govForm}\nSOURCES:\n${blog}\n${deadHost}`))],
      format: [
        () =>
          json(
            formatInteraction(
              draft({
                reportingPage: govForm,
                sources: [madeUp, blog, deadHost, 'S1'],
              }),
            ),
          ),
      ],
      pages: {
        [blog]: () => htmlResponse('<p>The city fixes potholes.</p>'),
        [govForm]: () => htmlResponse('<title>Report a problem</title><p>Use this form.</p>'),
        [madeUp]: () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/html' } }),
      },
    });
    const result = await runInvestigation(request, withContext, h.deps);
    const urls = result.sources.map((source) => source.url);
    assert.equal(result.responsibility.reportingUrl, govForm);
    assert.deepEqual(
      result.sources.find((source) => source.url === govForm),
      { title: 'Report a problem', url: govForm, note: 'Official page for reporting this.', official: true },
    );
    assert.ok(!urls.includes(madeUp));
    assert.ok(!urls.includes(blog));
    assert.ok(!urls.some((url) => url.includes('.invalid')));
    assert.ok(!h.pageCalls.includes(blog), 'a non-official model-named page is not even fetched');
  });

  it('removes contacts that are not published on a loaded official page', async () => {
    const h = harness({
      format: [
        () =>
          json(
            formatInteraction(
              draft({ email: 'potholes@cityofexample.gov', emailSource: 'S1', phone: '301-555-9999', phoneSource: 'S1' }),
            ),
          ),
      ],
    });
    const result = await runInvestigation(request, withContext, h.deps);
    assert.equal(result.responsibility.email, null);
    assert.equal(result.responsibility.phone, null);

    const kept = harness({
      format: [() => json(formatInteraction(draft({ phone: 'Public Works: +1 301.555.0100 (ask for Bob)', phoneSource: 'S1' })))],
    });
    const keptResult = await runInvestigation(request, withContext, kept.deps);
    assert.deepEqual(keptResult.responsibility.phone, { value: '(301) 555-0100', sourceUrl: ROADS_PAGE });
  });

  it('falls back only to a repair or service inbox on the office domain', async () => {
    const addresses = [
      'john.smith@cityofexample.gov',
      'press@cityofexample.gov',
      'jobs@cityofexample.gov',
      'webmaster@cityofexample.gov',
      'streets@othertown.gov',
      'streetmaintenance@cityofexample.gov',
    ];
    const h = harness({
      pages: { [ROADS_PAGE]: () => htmlResponse(roadsHtml(addresses.map((a) => `<p>${a}</p>`).join(''))) },
    });
    const result = await runInvestigation(request, withContext, h.deps);
    assert.deepEqual(result.responsibility.email, { value: 'streetmaintenance@cityofexample.gov', sourceUrl: ROADS_PAGE });

    const none = harness({
      pages: { [ROADS_PAGE]: () => htmlResponse(roadsHtml(addresses.slice(0, 5).map((a) => `<p>${a}</p>`).join(''))) },
    });
    const noneResult = await runInvestigation(request, withContext, none.deps);
    assert.equal(noneResult.responsibility.email, null);
  });

  it('retries once without quotes after a recitation block, and caps that result at best match', async () => {
    const h = harness({
      research: [
        () => json({ error: { code: 'recitation', message: 'blocked' } }, 400),
        () => json(researchInteraction('ORGANIZATION: City of Example')),
      ],
    });
    const result = await runInvestigation(request, withContext, h.deps);
    assert.equal(result.responsibility.verdict, 'best_match');
    assert.equal(result.responsibility.evidence, null);
    const researchBodies = h.geminiBodies.filter((body) => !body.response_format);
    assert.equal(researchBodies.length, 2);
    const retryText = (researchBodies[1].input as Array<{ text?: string }>)[0].text ?? '';
    assert.ok(retryText.includes(NO_QUOTE_RETRY));

    const viaStatus = harness({
      research: [
        () => json({ id: 'x', status: 'failed', steps: [], errors: [{ code: 'recitation', message: 'blocked' }] }),
        () => json(researchInteraction('ORGANIZATION: City of Example')),
      ],
    });
    assert.equal((await runInvestigation(request, withContext, viaStatus.deps)).responsibility.verdict, 'best_match');
  });

  it('returns unidentified with no invented name when no organization is found', async () => {
    const h = harness({
      format: [
        () =>
          json(
            formatInteraction(
              draft({
                organization: 'unknown',
                department: 'Public Works',
                email: 'streetmaintenance@cityofexample.gov',
                emailSource: 'S1',
                reportingPage: 'S1',
              }),
            ),
          ),
      ],
    });
    const result = await runInvestigation(request, withContext, h.deps);
    const r = result.responsibility;
    assert.equal(r.verdict, 'unidentified');
    assert.equal(r.organization, null);
    assert.equal(r.department, null);
    assert.equal(r.evidence, null);
    assert.equal(r.email, null);
    assert.equal(r.phone, null);
    assert.equal(r.reportingUrl, null);
    assert.doesNotMatch(r.reason, /City of|Public Works|College Park/);
  });

  it('continues with context null when map facts are slow', async () => {
    const h = harness({});
    const started = Date.now();
    const result = await runInvestigation(request, { getContext: () => new Promise(() => undefined) }, {
      ...h.deps,
      contextWaitMs: 30,
    });
    assert.ok(Date.now() - started < 2_000);
    assert.equal(result.context, null);
    assert.match((h.geminiBodies[0].input as Array<{ text: string }>)[0].text, /Map facts: none arrived in time/);
    assert.ok(result.warnings.some((w) => w.startsWith("Map facts for this spot didn't load in time")));
  });

  it('warns about partial map facts and about a daytime streetlight photo without an outage note', async () => {
    const h = harness({
      format: [
        () =>
          json(
            formatInteraction(
              draft({
                issue: { kind: 'streetlight', title: 'Streetlight', summary: 'A light.', observations: [] },
                photoLooksDaytime: true,
                noteSaysLightIsOut: false,
              }),
            ),
          ),
      ],
    });
    const result = await runInvestigation(request, { getContext: async () => ({ ...context, partial: true }) }, h.deps);
    assert.ok(result.warnings.some((w) => w.startsWith('This photo looks like it was taken in daylight')));
    assert.ok(result.warnings.some((w) => w.startsWith("Some map facts didn't load")));
  });

  it('maps provider errors to safe codes without leaking the provider message', async () => {
    const cases: Array<[number, unknown, string]> = [
      [429, { error: { code: 'rate_limit_exceeded', message: 'secret provider detail' } }, 'RESEARCH_QUOTA'],
      [429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'secret provider detail' } }, 'RESEARCH_QUOTA'],
      [401, { error: { code: 'authentication', message: 'secret provider detail' } }, 'RESEARCH_UNAVAILABLE'],
      [403, { error: { code: 'permission_denied', message: 'secret provider detail' } }, 'RESEARCH_UNAVAILABLE'],
      [500, { error: { code: 'api_error', message: 'secret provider detail' } }, 'RESEARCH_FAILED'],
    ];
    for (const [status, body, code] of cases) {
      const h = harness({ research: [() => json(body, status)] });
      await assert.rejects(runInvestigation(request, withContext, h.deps), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, code);
        assert.doesNotMatch(error.message, /secret provider detail|test-key/);
        return true;
      });
    }
  });

  it('stops when the caller aborts', async () => {
    const h = harness({});
    const controller = new AbortController();
    controller.abort(new DOMException('cancelled', 'AbortError'));
    await assert.rejects(runInvestigation(request, { signal: controller.signal, ...withContext }, h.deps), { name: 'AbortError' });
  });

  // ---- product-rule regressions from review

  const NEWS_PAGE = 'https://news.example.com/college-park-roads';
  const noQuoteRoads = () =>
    htmlResponse('<title>Roads | City of Example</title><p>Public Works handles road repairs. Call (301) 555-0100.</p>');
  const searchWith = (extra: Array<{ url: string; title: string }>) => () =>
    json(researchInteraction('ORGANIZATION: City of Example', [{ url: REDIRECT, title: 'cityofexample.gov' }, ...extra]));

  it('does not confirm when the quote is only on a non-official page search returned', async () => {
    const h = harness({
      research: [searchWith([{ url: NEWS_PAGE, title: 'Local news' }])],
      format: [() => json(formatInteraction(draft({ coverageSource: 'S2' })))],
      pages: { [ROADS_PAGE]: noQuoteRoads, [NEWS_PAGE]: () => htmlResponse(`<p>${QUOTE}</p>`) },
    });
    const result = await runInvestigation(request, withContext, h.deps);
    assert.equal(result.responsibility.verdict, 'best_match');
    assert.equal(result.responsibility.evidence, null);
    assert.equal(result.sources.find((s) => s.url === NEWS_PAGE)?.official, false);
  });

  it('drops an email printed only on a non-official page', async () => {
    const h = harness({
      research: [searchWith([{ url: NEWS_PAGE, title: 'Local news' }])],
      format: [() => json(formatInteraction(draft({ email: 'streetmaintenance@cityofexample.gov', emailSource: 'S2' })))],
      pages: { [NEWS_PAGE]: () => htmlResponse('<p>Write to streetmaintenance@cityofexample.gov</p>') },
    });
    const result = await runInvestigation(request, withContext, h.deps);
    assert.equal(result.responsibility.email, null);
  });

  it('caps the result at best match when the format call is blocked for recitation', async () => {
    const h = harness({
      format: [() => json({ error: { code: 'recitation', message: 'blocked' } }, 400), () => json(formatInteraction(draft()))],
    });
    const result = await runInvestigation(request, withContext, h.deps);
    assert.equal(h.geminiBodies.filter((body) => body.response_format).length, 2);
    assert.equal(result.responsibility.verdict, 'best_match');
    assert.equal(result.responsibility.evidence, null);
  });

  it('does not treat an official URL that redirects to a non-official host as official', async () => {
    const movedSearch = 'https://www.cityofexample.gov/moved-search';
    const movedNamed = 'https://www.cityofexample.gov/moved-named';
    const mirror = 'https://seo-mirror.example.com/roads';
    const mirror2 = 'https://seo-mirror2.example.com/roads';
    const h = harness({
      research: [searchWith([{ url: movedSearch, title: 'Roads' }])],
      format: [() => json(formatInteraction(draft({ coverageSource: movedNamed, sources: ['S2', movedNamed] })))],
      pages: {
        [ROADS_PAGE]: noQuoteRoads,
        [movedSearch]: () => new Response(null, { status: 301, headers: { location: mirror } }),
        [movedNamed]: () => new Response(null, { status: 301, headers: { location: mirror2 } }),
        [mirror]: () => htmlResponse(`<p>${QUOTE}</p>`),
        [mirror2]: () => htmlResponse(`<p>${QUOTE}</p>`),
      },
    });
    const result = await runInvestigation(request, withContext, h.deps);
    assert.equal(result.responsibility.verdict, 'best_match');
    assert.equal(result.sources.find((s) => s.url === mirror)?.official, false, 'search page kept, but not official');
    assert.ok(!result.sources.some((s) => s.url === mirror2), 'model-named page landing off the allowed hosts is dropped');
  });

  it('strips unverified emails, phone numbers, and links from model-written text', async () => {
    const h = harness({
      format: [
        () =>
          json(
            formatInteraction(
              draft({
                phone: '301-555-0100',
                phoneSource: 'S1',
                reason:
                  'Report it at https://evil.example.com/report or call (301) 555-0199. The city maintains this street. Call (301) 555-0100 for repairs.',
                department: 'Public Works, fixit@evil.example.com',
                issue: {
                  kind: 'pothole',
                  title: 'Pothole, email fixit@evil.example.com',
                  summary: 'Call 911 now.',
                  observations: ['Deep hole', 'Text 301-555-0199 for help', 'See www.evil.example.com'],
                },
              }),
            ),
          ),
      ],
    });
    const result = await runInvestigation(request, withContext, h.deps);
    assert.equal(result.responsibility.reason, 'The city maintains this street. Call (301) 555-0100 for repairs.');
    assert.equal(result.responsibility.department, null);
    assert.equal(result.issue.title, 'Problem to report');
    assert.equal(result.issue.summary, 'See the photo for what needs fixing.');
    assert.deepEqual(result.issue.observations, ['Deep hole']);
    assert.doesNotMatch(JSON.stringify(result.issue), /evil|555-0199/);
  });

  it('counts a citation as search-returned only if search returned it', async () => {
    const blog = 'https://some-blog.example/pothole';
    const interaction = researchInteraction('ORGANIZATION: City of Example');
    const output = interaction.steps[3] as { content: Array<{ annotations: unknown[] }> };
    output.content[0].annotations.push({ type: 'url_citation', url: blog, title: 'Blog', start_index: 0, end_index: 5 });
    const h = harness({
      research: [() => json(interaction)],
      format: [() => json(formatInteraction(draft({ reportingPage: blog, sources: ['S1', blog] })))],
      pages: { [blog]: () => htmlResponse('<title>Report potholes here</title>') },
    });
    const result = await runInvestigation(request, withContext, h.deps);
    assert.ok(!h.pageCalls.includes(blog));
    assert.ok(!result.sources.some((s) => s.url === blog));
    assert.equal(result.responsibility.reportingUrl, null);
  });

  it('uses only an official loaded page as the reporting link', async () => {
    const h = harness({
      research: [searchWith([{ url: NEWS_PAGE, title: 'How to report potholes' }])],
      format: [() => json(formatInteraction(draft({ reportingPage: 'S2' })))],
      pages: { [NEWS_PAGE]: () => htmlResponse('<p>Report potholes here.</p>') },
    });
    const result = await runInvestigation(request, withContext, h.deps);
    assert.equal(result.responsibility.reportingUrl, null);
    assert.ok(result.sources.some((s) => s.url === NEWS_PAGE));
  });

  it('names no office when no official page loaded', async () => {
    const h = harness({
      pages: {
        [REDIRECT]: () => new Response(null, { status: 302, headers: { location: NEWS_PAGE } }),
        [NEWS_PAGE]: () => htmlResponse(`<p>${QUOTE}</p>`),
      },
    });
    const result = await runInvestigation(request, withContext, h.deps);
    assert.equal(result.responsibility.verdict, 'unidentified');
    assert.equal(result.responsibility.organization, null);
    assert.equal(result.responsibility.department, null);
  });

  it('ends at the budget even when a step ignores its abort signal', async () => {
    const h = harness({});
    const stuck: PageTransport = () => new Promise(() => undefined);
    const started = Date.now();
    await assert.rejects(
      runInvestigation(request, withContext, { ...h.deps, pageTransport: stuck, budgetMs: 100, pageTimeoutMs: 60_000 }),
      { code: 'RESEARCH_FAILED' },
    );
    assert.ok(Date.now() - started < 2_000);
  });
});

describe('public entry points', () => {
  let savedKey: string | undefined;
  const savedFetch = globalThis.fetch;
  beforeEach(() => {
    savedKey = process.env.GEMINI_API_KEY;
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedKey;
    globalThis.fetch = savedFetch;
  });

  it('reports RESEARCH_UNAVAILABLE without calling Gemini when no key is set', async () => {
    delete process.env.GEMINI_API_KEY;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return json({});
    }) as typeof fetch;
    assert.equal(researchConfigured(), false);
    await assert.rejects(investigate(request), { code: 'RESEARCH_UNAVAILABLE', status: 503, message: 'Report lookup is offline right now.' });
    assert.equal(called, false);
  });

  it('reports RESEARCH_QUOTA when Gemini answers 429', async () => {
    process.env.GEMINI_API_KEY = KEY;
    globalThis.fetch = (async () => json({ error: { code: 'quota_exceeded', message: 'secret' } }, 429)) as typeof fetch;
    assert.equal(researchConfigured(), true);
    await assert.rejects(investigate(request), { code: 'RESEARCH_QUOTA', status: 503 });
  });
});
