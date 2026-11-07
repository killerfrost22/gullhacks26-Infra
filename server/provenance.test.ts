import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { InvestigationRequest } from '../shared/types.js';
import type { ResearchOutput } from './research-schema.js';
import { groundInvestigation } from './provenance.js';
import { normalizedSourceText, isPublicAddress, canonicalSourceUrl } from './source-verification.js';

const officialUrl = 'https://official.example.org/roads';
const quote = 'The Department maintains public roads within Example City municipal boundaries.';
const input: InvestigationRequest = {
  photoDataUrl: 'data:image/jpeg;base64,/9j/2Q==',
  location: { latitude: 0, longitude: 180, label: 'User-confirmed point', address: null },
  details: 'Eastbound lane, next to the bus stop.',
};

function fixture(): ResearchOutput {
  return {
    issue: {
      type: 'pothole', title: 'Pothole in travel lane', summary: 'There’s a pothole in the eastbound lane.',
      observations: ['Broken asphalt with loose gravel'], photoLooksLikeDaytime: true, detailsSayLightIsOut: false,
    },
    responsibility: {
      status: 'source_supported', organization: 'Example City', department: 'Roads', email: 'roads@official.example.org',
      emailSourceUrl: officialUrl, phone: null, phoneSourceUrl: null, reportingUrl: officialUrl,
      reason: 'The official page establishes road maintenance coverage.', coverageSourceUrl: officialUrl, coverageQuote: quote,
    },
    sources: [{ title: 'Road maintenance', url: officialUrl, note: 'Official road service coverage.', isOfficial: true }],
    warnings: [],
  };
}

test('published email and exact official coverage evidence survive; input coordinates remain authoritative', async () => {
  const result = await groundInvestigation(fixture(), [officialUrl], input, new AbortController().signal,
    async () => ({ text: normalizedSourceText(quote), publishedEmails: new Set(['roads@official.example.org']) }));
  assert.equal(result.responsibility.status, 'source_supported');
  assert.equal(result.responsibility.email, 'roads@official.example.org');
  assert.deepEqual(result.location, input.location);
});

test('invented source URLs on sites search never returned cannot ground routing or contacts, and are never fetched', async () => {
  let reads = 0;
  const result = await groundInvestigation(fixture(), ['https://elsewhere.example.net/'], input, new AbortController().signal,
    async () => { reads += 1; return null; });
  assert.equal(reads, 0);
  assert.equal(result.responsibility.status, 'unresolved');
  assert.equal(result.responsibility.organization, null);
  assert.equal(result.responsibility.email, null);
  assert.equal(result.responsibility.emailSourceUrl, null);
  assert.equal(result.responsibility.reportingUrl, null);
  assert.deepEqual(result.sources, []);
});

test('a deeper page on a site search returned counts only when the server can read it', async () => {
  const homepage = 'https://www.example.org/';
  const readable = await groundInvestigation(fixture(), [homepage], input, new AbortController().signal,
    async (url) => url === officialUrl ? { text: normalizedSourceText(quote), publishedEmails: new Set(['roads@official.example.org']) } : null);
  assert.equal(readable.responsibility.status, 'source_supported');
  assert.deepEqual(readable.sources.map((source) => source.url), [officialUrl]);
  assert.equal(readable.responsibility.email, 'roads@official.example.org');
  const unreadable = await groundInvestigation(fixture(), [homepage], input, new AbortController().signal, async () => null);
  assert.equal(unreadable.responsibility.status, 'unresolved', 'a page that does not load is treated as invented');
  assert.deepEqual(unreadable.sources, []);
});

test('pages search never returned are read only on public-sector or campus sites, and kept only if they load', async () => {
  const agencyPage = 'https://roads.state.example.gov/report-a-problem';
  const campusPage = 'https://facilities.college.example.org/work-request';
  const vendorPage = 'https://pothole-reports.example.com/';
  const data = fixture();
  data.responsibility = { ...data.responsibility, status: 'needs_review', email: null, emailSourceUrl: null, coverageSourceUrl: null, coverageQuote: null, reportingUrl: agencyPage };
  data.sources = [agencyPage, campusPage, vendorPage].map((url) => ({ title: 'Report a problem', url, note: 'Report form.', isOfficial: true }));
  const reads: string[] = [];
  const result = await groundInvestigation(data, [], input, new AbortController().signal, async (url) => {
    reads.push(url);
    return url === campusPage ? null : { text: 'report a pothole', publishedEmails: new Set<string>() };
  }, ['https://www.college.example.org/']);
  assert.ok(!reads.includes(vendorPage), 'an ordinary commercial site is never treated as checkable');
  assert.ok(reads.includes(agencyPage) && reads.includes(campusPage));
  assert.deepEqual(result.sources.map((source) => source.url), [agencyPage], 'the campus page did not load, so it is dropped');
  assert.equal(result.responsibility.reportingUrl, agencyPage);
  assert.equal(result.responsibility.status, 'needs_review');
});

test('official contact page alone is not proof of coverage and unpublished email is removed', async () => {
  const data = fixture();
  data.responsibility.reason += ' Contact guessed@official.example.org.';
  const result = await groundInvestigation(data, [officialUrl], input, new AbortController().signal,
    async () => ({ text: 'general office contact information', publishedEmails: new Set() }));
  assert.equal(result.responsibility.status, 'needs_review');
  assert.equal(result.responsibility.email, null);
  assert.equal(result.responsibility.emailSourceUrl, null);
  assert.ok(!JSON.stringify(result).includes('guessed@official.example.org'));
});

test('without a usable model email, a service inbox published on the office’s own official page is offered with its source', async () => {
  const data = fixture();
  data.responsibility.email = null;
  data.responsibility.emailSourceUrl = null;
  const blogUrl = 'https://blog.example.net/potholes';
  data.sources.push({ title: 'Neighborhood blog', url: blogUrl, note: 'Unofficial tips.', isOfficial: false });
  const officialInboxes = ['webmaster@official.example.org', 'jane.doe@official.example.org', 'press@official.example.org',
    'roads@elsewhere.example.com', 'info@official.example.org', 'streetmaintenance@dpw.example.org'];
  const read = (inboxes: string[]) => async (url: string) => ({
    text: normalizedSourceText(quote),
    publishedEmails: new Set(url === blogUrl ? ['potholes@blog.example.net'] : inboxes),
  });
  const best = await groundInvestigation(data, [officialUrl, blogUrl], input, new AbortController().signal, read(officialInboxes));
  assert.equal(best.responsibility.email, 'streetmaintenance@dpw.example.org', 'service inboxes on the same registered domain win');
  assert.equal(best.responsibility.emailSourceUrl, officialUrl);
  const general = await groundInvestigation(data, [officialUrl, blogUrl], input, new AbortController().signal,
    read(['jane.doe@official.example.org', 'info@official.example.org']));
  assert.equal(general.responsibility.email, 'info@official.example.org', 'a general inbox is used only when nothing better is published');
  const none = await groundInvestigation(data, [officialUrl, blogUrl], input, new AbortController().signal,
    read(['jane.doe@official.example.org', 'press@official.example.org', 'roads@elsewhere.example.com']));
  assert.equal(none.responsibility.email, null, 'personal, press, other-domain, and unofficial-page addresses are never chosen');
});


test('source fetching rejects non-public and mapped addresses and unsafe URL schemes', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1', '2001:db8::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  assert.equal(canonicalSourceUrl('javascript:alert(1)'), null);
  assert.equal(canonicalSourceUrl('https://user:secret@example.org/'), null);
  assert.equal(canonicalSourceUrl('https://example.org/a#contact'), 'https://example.org/a');
});

test('the daylight caveat follows the model’s judgment, and warnings are deduplicated and capped at three', async () => {
  const read = async () => ({ text: normalizedSourceText(quote), publishedEmails: new Set(['roads@official.example.org']) });
  const outage = fixture();
  outage.issue = { ...outage.issue, type: 'light_outage', photoLooksLikeDaytime: true, detailsSayLightIsOut: false };
  outage.warnings = ['Stay off the road while taking photos.', 'Stay off the road while taking photos!', 'Call 911 if the pole is down.', 'A fourth note.'];
  const flagged = await groundInvestigation(outage, [officialUrl], input, new AbortController().signal, read);
  assert.equal(flagged.warnings.length, 3);
  assert.match(flagged.warnings[0], /daytime/);
  assert.deepEqual(flagged.warnings.slice(1), ['Stay off the road while taking photos.', 'Call 911 if the pole is down.']);
  assert.equal('photoLooksLikeDaytime' in flagged.issue || 'detailsSayLightIsOut' in flagged.issue, false);
  const described = fixture();
  described.issue = { ...described.issue, type: 'light_outage', photoLooksLikeDaytime: true, detailsSayLightIsOut: true };
  const unflagged = await groundInvestigation(described, [officialUrl], input, new AbortController().signal, read);
  assert.deepEqual(unflagged.warnings, []);
});

test('a verbatim quote credited to the wrong link still counts only where an official cited page contains it', async () => {
  const countyUrl = 'https://county.example.org/potholes';
  const data = fixture();
  data.responsibility.coverageSourceUrl = 'https://county.example.org/media/photo.jpg';
  data.responsibility.email = null;
  data.sources.push({ title: 'County potholes', url: countyUrl, note: 'Lists state-numbered routes.', isOfficial: true });
  const pagesRead: string[] = [];
  const read = async (url: string) => {
    pagesRead.push(url);
    return url === countyUrl ? { text: normalizedSourceText(`<li>${quote}</li>`), publishedEmails: new Set<string>() } : null;
  };
  const supported = await groundInvestigation(data, [officialUrl, countyUrl], input, new AbortController().signal, read);
  assert.equal(supported.responsibility.status, 'source_supported');
  assert.ok(pagesRead.includes(countyUrl));
  const unofficial = fixture();
  unofficial.responsibility.coverageSourceUrl = null;
  unofficial.sources.push({ title: 'Blog', url: countyUrl, note: 'Unofficial copy.', isOfficial: false });
  const downgraded = await groundInvestigation(unofficial, [officialUrl, countyUrl], input, new AbortController().signal, read);
  assert.equal(downgraded.responsibility.status, 'needs_review');
});

test('a named office on an official cited page is reported as a candidate even if the model said unresolved', async () => {
  const data = fixture();
  data.responsibility = { ...data.responsibility, status: 'unresolved', email: null, coverageSourceUrl: null, coverageQuote: null };
  const result = await groundInvestigation(data, [officialUrl], input, new AbortController().signal, async () => null);
  assert.equal(result.responsibility.status, 'needs_review');
  assert.equal(result.responsibility.organization, 'Example City');
  assert.equal(result.responsibility.reportingUrl, officialUrl);
});

test('an HOA or community association found via search tools is preserved as a best guess candidate', async () => {
  const hoaUrl = 'https://greenbeltstationhoa.org/maintenance';
  const data: ResearchOutput = {
    issue: {
      type: 'pothole', title: 'Road damage', summary: 'Depression in private community lane.',
      observations: ['Cracked pavement'], photoLooksLikeDaytime: true, detailsSayLightIsOut: false,
    },
    responsibility: {
      status: 'needs_review', organization: 'Greenbelt Station HOA', department: 'Property Management',
      email: 'service@greenbeltstationhoa.org', emailSourceUrl: hoaUrl, phone: null, phoneSourceUrl: null,
      reportingUrl: hoaUrl, reason: 'Greenbelt Station HOA manages common roads in this development.',
      coverageSourceUrl: null, coverageQuote: null,
    },
    sources: [{ title: 'Greenbelt Station HOA', url: hoaUrl, note: 'Community maintenance info.', isOfficial: false }],
    warnings: [],
  };
  const result = await groundInvestigation(data, [hoaUrl], input, new AbortController().signal, async () => ({
    text: 'greenbelt station hoa resident portal and repair requests',
    publishedEmails: new Set(['service@greenbeltstationhoa.org']),
  }));
  assert.equal(result.responsibility.status, 'needs_review');
  assert.equal(result.responsibility.organization, 'Greenbelt Station HOA');
  assert.equal(result.responsibility.department, 'Property Management');
  assert.equal(result.responsibility.email, 'service@greenbeltstationhoa.org');
  assert.equal(result.responsibility.reportingUrl, hoaUrl);
});
