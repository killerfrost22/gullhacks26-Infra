import test from 'node:test';
import assert from 'node:assert/strict';
import type { InvestigationRequest } from '../shared/types.js';
import { parseGeminiResearch, parseGeminiReport, resolveGroundedResearch } from './gemini-response.js';
import { groundInvestigation } from './provenance.js';
import { normalizedSourceText } from './source-verification.js';
import type { ResearchOutput } from './research-schema.js';
import { ApiError } from './errors.js';

// Real provider shape: Google Search grounding cites an opaque redirect and names the publisher domain in `title`.
const redirectUrl = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQExampleToken';
const sourceUrl = 'https://www.official.example.org/maintenance';
const quote = 'Campus Drive between Route 1 and River Road is maintained by the State Highway Administration.';
const research: ResearchOutput = {
  issue: {
    type: 'pothole', title: 'Pothole in travel lane', summary: 'There’s a pothole in the eastbound lane.', observations: [],
    photoLooksLikeDaytime: true, detailsSayLightIsOut: false,
  },
  responsibility: {
    status: 'source_supported', organization: 'State Highway Administration', department: null, email: null, emailSourceUrl: null,
    phone: null, phoneSourceUrl: null, reportingUrl: sourceUrl, reason: 'The city lists Campus Drive as a state road.',
    coverageSourceUrl: sourceUrl, coverageQuote: quote,
  },
  sources: [
    { title: 'How to report an issue', url: sourceUrl, note: 'Lists who maintains each road.', isOfficial: true },
    { title: 'Unseen page', url: 'https://unseen.example.org/', note: 'A generated claim without tool evidence.', isOfficial: false },
  ],
  warnings: [],
};
const suggestions = '<div><a href="https://www.google.com/search?q=maintenance">maintenance</a></div>';
function response(): { status: string; steps: Record<string, unknown>[] } {
  return {
    status: 'completed',
    steps: [
      { type: 'google_search_call', id: 'search-1', arguments: { queries: ['maintenance'] } },
      { type: 'google_search_result', call_id: 'search-1', result: [{ search_suggestions: suggestions }] },
      { type: 'model_output', content: [{
        type: 'text',
        // The model links its claims with the same redirect URLs it cites.
        text: `The city says: "${quote}" ([How to report](${redirectUrl})). Older page: ${redirectUrl}Uncited`,
        annotations: [{ type: 'url_citation', url: redirectUrl, title: 'official.example.org', start_index: 0, end_index: 40 }],
      }] },
    ],
  };
}
const input: InvestigationRequest = {
  photoDataUrl: 'data:image/jpeg;base64,/9j/2Q==',
  location: { latitude: 38.9886, longitude: -76.9365, label: 'Campus Drive', address: null },
  details: 'Eastbound lane just inside the gate.',
};

function hasCode(code: string) {
  return (error: unknown) => error instanceof ApiError && error.code === code;
}

test('a model claim, unmatched result, or failed tool call cannot stand in for live search', () => {
  for (const steps of [
    [response().steps[2]],
    [response().steps[1], response().steps[2]],
    [response().steps[0], { ...response().steps[1], is_error: true }, response().steps[2]],
  ]) assert.throws(() => parseGeminiResearch({ status: 'completed', steps }), hasCode('RESEARCH_NOT_GROUNDED'));
});

test('citation metadata and successful URL retrieval ground sources; generated source claims do not', () => {
  const value = response();
  value.steps.splice(2, 0,
    { type: 'url_context_call', id: 'url-1', arguments: { urls: ['https://official.example.org/contact'] } },
    { type: 'url_context_result', call_id: 'url-1', result: [
      { url: 'https://official.example.org/contact', status: 'success' },
      { url: 'https://official.example.org/unreadable', status: 'paywall' },
    ] },
  );
  const result = parseGeminiResearch(value);
  assert.equal(result.sourceUrls.get(redirectUrl), 'official.example.org');
  assert.equal(result.sourceUrls.get('https://official.example.org/contact'), null);
  assert.equal(result.sourceUrls.has(sourceUrl), false, 'URLs written in the brief are not tool evidence.');
  assert.equal(result.sourceUrls.has('https://unseen.example.org/'), false);
  assert.equal(result.sourceUrls.has('https://official.example.org/unreadable'), false);
});

test('regression: grounding-redirect citations resolve to the real page, so routing survives provenance checks', async () => {
  const grounded = parseGeminiResearch(response());
  const signal = new AbortController().signal;
  const requested: string[] = [];
  const { brief, sourceUrls } = await resolveGroundedResearch(grounded, signal, async (url) => { requested.push(url); return `${sourceUrl}#top`; });
  assert.deepEqual(requested, [redirectUrl]);
  assert.deepEqual([...sourceUrls], [sourceUrl]);
  assert.equal(brief, `The city says: "${quote}" ([How to report](${sourceUrl})). Older page: (link unavailable)`);
  const read = async (url: string) => (url === sourceUrl ? { text: normalizedSourceText(`<p>${quote}</p>`), publishedEmails: new Set<string>() } : null);
  const report = await groundInvestigation(research, sourceUrls, input, signal, read);
  assert.equal(report.responsibility.status, 'source_supported');
  assert.equal(report.responsibility.organization, 'State Highway Administration');
  assert.equal(report.responsibility.reportingUrl, sourceUrl);
  assert.deepEqual(report.sources.map((source) => source.url), [sourceUrl]);
  // The pre-fix path handed the raw redirect URLs to provenance, which dropped every real source.
  const unresolved = await groundInvestigation(research, grounded.sourceUrls.keys(), input, signal, read);
  assert.equal(unresolved.responsibility.status, 'unresolved');
});

test('unresolvable redirects and targets that contradict the cited publisher are dropped', async () => {
  const signal = new AbortController().signal;
  const sources = new Map<string, string | null>([
    [`${redirectUrl}-a`, 'official.example.org'],
    [`${redirectUrl}-b`, 'official.example.org'],
    [`${redirectUrl}-c`, 'Example City website'],
    [`${redirectUrl}-d`, 'official.example.org'],
    ['https://vertexaisearch.cloud.google.com/other-path/x', null],
    ['https://direct.example.org/page#part', null],
  ]);
  const targets: Record<string, string | null> = {
    [`${redirectUrl}-a`]: 'https://attacker.example.net/official.example.org',
    [`${redirectUrl}-b`]: null,
    [`${redirectUrl}-c`]: 'https://city.example.org/roads',
    [`${redirectUrl}-d`]: redirectUrl,
  };
  const { sourceUrls: resolved } = await resolveGroundedResearch({ brief: '', sourceUrls: sources }, signal, async (url) => targets[url] ?? null);
  assert.deepEqual([...resolved].sort(), [
    'https://city.example.org/roads',
    'https://direct.example.org/page',
    'https://vertexaisearch.cloud.google.com/other-path/x',
  ]);
});

test('incomplete research and missing search attribution are not presented as a completed report', () => {
  assert.throws(() => parseGeminiResearch({ ...response(), status: 'in_progress' }), hasCode('RESEARCH_INCOMPLETE'));
  const value = response();
  value.steps[1] = { type: 'google_search_result', call_id: 'search-1', result: [] };
  assert.throws(() => parseGeminiResearch(value), hasCode('RESEARCH_ATTRIBUTION_MISSING'));
});

test('report formatting rejects tool activity even when it accompanies a valid JSON report', () => {
  const value = response();
  value.steps[2] = { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(research) }] };
  assert.throws(() => parseGeminiReport(value), hasCode('RESEARCH_INVALID_OUTPUT'));
});

test('unfinished or malformed formatting cannot become a completed report', () => {
  const formatted = {
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(research) }] }],
  };
  assert.equal(parseGeminiReport(formatted).responsibility.organization, 'State Highway Administration');
  assert.throws(() => parseGeminiReport({ ...formatted, status: 'in_progress' }), hasCode('RESEARCH_INCOMPLETE'));
  formatted.steps[0].content[0].text = JSON.stringify({ ...research, responsibility: { ...research.responsibility, email: 123 } });
  assert.throws(() => parseGeminiReport(formatted), hasCode('RESEARCH_INVALID_OUTPUT'));
});
