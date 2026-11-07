import { randomUUID } from 'node:crypto';
import type { Investigation, InvestigationRequest } from '../shared/types.js';
import type { ResearchOutput } from './research-schema.js';
import { canonicalSourceUrl, normalizedSourceText, readSourcePage } from './source-verification.js';
import type { VerifiedPage } from './source-verification.js';

const MAX_WARNINGS = 3;
const MAX_EXTRA_COVERAGE_PAGES = 4;
const MAX_UNLISTED_PAGES = 4;
// Government, military, and education domains. Their pages are worth checking even when search didn't return them.
const PUBLIC_SECTOR_HOST = /\.(gov|edu|mil)$|\.(gov|govt|gob|gouv|edu|ac|mil)\.[a-z]{2}$|\.gc\.ca$/;

// Inboxes that never handle repair requests, and personal-looking addresses, are never offered as a recipient.
const NON_SERVICE_INBOX = /webmaster|privacy|press|media|news|communicat|job|career|employ|recruit|^hr$|human.?resource|foia|records|^pia$|no.?reply|donotreply|accessib|^ada$|marketing|event|clerk|mayor|council|legal|billing|payroll|procure|purchas/;
const SERVICE_INBOX = /maint|works|dpw|street|road|transport|traffic|311|service|request|facilit|work.?order|operation|pothole|light|outage|engineer|highway|repair/;
const GENERAL_INBOX = /^(info|contact|contactus|contact-us|help|helpdesk|questions|ask|general|inquiries|enquiries)$/;
const TWO_PART_SUFFIX = /^(co|com|gov|govt|ac|org|net|edu)$/;

/** The part of a hostname an organization registers: "roads.maryland.gov" → "maryland.gov", "x.gov.uk" → "x.gov.uk". */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  const parts = labels.length >= 3 && labels.at(-1)!.length === 2 && TWO_PART_SUFFIX.test(labels.at(-2)!) ? 3 : 2;
  return labels.slice(-parts).join('.');
}

/**
 * A repair or general inbox published on an official page we already read, on that page's own domain.
 * Service inboxes beat general ones; anything else (personal names, press, HR) is never chosen.
 */
function publishedServiceInbox(pages: [string, VerifiedPage | null | undefined][]): { email: string; url: string } | null {
  let best: { email: string; url: string; score: number } | null = null;
  for (const [url, page] of pages) {
    if (!page) continue;
    const site = registrableDomain(new URL(url).hostname);
    for (const email of page.publishedEmails) {
      const [local, domain] = email.split('@');
      if (!local || !domain || registrableDomain(domain) !== site || NON_SERVICE_INBOX.test(local)) continue;
      const score = SERVICE_INBOX.test(local) ? 2 : GENERAL_INBOX.test(local) ? 1 : 0;
      if (score > (best?.score ?? 0)) best = { email, url, score };
    }
  }
  return best && { email: best.email, url: best.url };
}

/**
 * Whether a cited page the search tools didn't return is still worth the server reading: it is on a public-sector
 * domain or on a site we already trust (a site search returned, or the campus's own website).
 */
export function isCheckableSource(url: string, trustedSites: ReadonlySet<string>): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return PUBLIC_SECTOR_HOST.test(host) || trustedSites.has(registrableDomain(host));
}

/**
 * Keeps only evidence the server can stand behind. A source counts if the search tools returned it, or if it is a
 * checkable page (see `isCheckableSource`) that the server reads successfully right now: a made-up link never loads.
 */
export async function groundInvestigation(
  research: ResearchOutput,
  toolUrls: Iterable<string>,
  input: InvestigationRequest,
  signal: AbortSignal,
  readPage: (url: string, signal: AbortSignal) => Promise<VerifiedPage | null> = readSourcePage,
  trustedHomepages: Iterable<string> = [],
): Promise<Omit<Investigation, 'searchSuggestionsHtml' | 'timings' | 'context'>> {
  const allowedUrls = new Set<string>();
  for (const value of toolUrls) {
    const url = canonicalSourceUrl(value);
    if (url) allowedUrls.add(url);
  }
  const homepages = [...trustedHomepages].map(canonicalSourceUrl).filter((url): url is string => url !== null);
  const trustedSites = new Set([...allowedUrls, ...homepages].map((url) => registrableDomain(new URL(url).hostname)));
  const pages = new Map<string, VerifiedPage | null>();
  const cited = [...research.sources.map((source) => source.url), research.responsibility.coverageSourceUrl,
    research.responsibility.emailSourceUrl, research.responsibility.phoneSourceUrl, research.responsibility.reportingUrl];
  const unlisted = [...new Set(cited.map((value) => (value ? canonicalSourceUrl(value) : null)))]
    .filter((url): url is string => url !== null && !allowedUrls.has(url) && isCheckableSource(url, trustedSites))
    .slice(0, MAX_UNLISTED_PAGES);
  await Promise.all(unlisted.map(async (url) => {
    const page = await readPage(url, signal);
    pages.set(url, page);
    if (page) allowedUrls.add(url);
  }));
  const accepted = new Map<string, ResearchOutput['sources'][number]>();
  for (const source of research.sources) {
    const url = canonicalSourceUrl(source.url);
    if (url && allowedUrls.has(url) && !accepted.has(url)) accepted.set(url, { ...source, url });
  }
  const acceptedUrls = new Set([...accepted.values()].map((source) => source.url));
  const officialUrls = new Set([...accepted.values()].filter((source) => source.isOfficial).map((source) => source.url));
  // Server findings come first: they are facts about this report, unlike the model's advisory notes.
  const warnings: string[] = [];
  const candidate = research.responsibility;
  const validAcceptedUrl = (value: string | null): string | null => {
    const url = value ? canonicalSourceUrl(value) : null;
    return url && acceptedUrls.has(url) ? url : null;
  };
  const officialUrl = (value: string | null): string | null => {
    const url = value ? canonicalSourceUrl(value) : null;
    return url && officialUrls.has(url) ? url : null;
  };
  const coverageUrl = officialUrl(candidate.coverageSourceUrl);
  const emailUrl = validAcceptedUrl(candidate.emailSourceUrl);
  const phoneUrl = validAcceptedUrl(candidate.phoneSourceUrl);
  const pageUrls = new Set([coverageUrl, emailUrl, phoneUrl].filter((url): url is string => url !== null && !pages.has(url)));
  await Promise.all([...pageUrls].map(async (url) => { pages.set(url, await readPage(url, signal)); }));
  const quote = candidate.coverageQuote ? normalizedSourceText(candidate.coverageQuote) : '';
  let coverageSupported = Boolean(coverageUrl && quote.length >= 30 && pages.get(coverageUrl)?.text.includes(quote));
  if (!coverageSupported && quote.length >= 30 && officialUrls.size > 0) {
    // The model sometimes credits a correct quote to the wrong link; accept it only where an official cited page contains it.
    const others = [...officialUrls].filter((url) => !pages.has(url)).slice(0, MAX_EXTRA_COVERAGE_PAGES);
    await Promise.all(others.map(async (url) => { pages.set(url, await readPage(url, signal)); }));
    coverageSupported = [...officialUrls].some((url) => pages.get(url)?.text.includes(quote));
  }
  let status = candidate.status;
  let reason = candidate.reason;
  let organization = candidate.organization;
  let department = candidate.department;
  if (!accepted.size || !organization) {
    status = 'unresolved';
    organization = null;
    department = null;
    reason = 'We couldn’t find an official page saying who looks after this spot.';
    warnings.push('Check the local city or county “report a problem” page before sending.');
  } else if (status === 'source_supported' && (!coverageSupported || !officialUrls.size)) {
    // The model's reason names the concrete fact; the "best match" label already says it isn't confirmed word for word.
    status = 'needs_review';
  } else if (status === 'unresolved' && organization) {
    // A named office or HOA backed by search-returned pages is a candidate to check, not an unknown owner.
    status = 'needs_review';
  }
  // An untraceable reporting link is dropped silently: there is nothing for the reporter to act on.
  const reportingUrl = organization ? (validAcceptedUrl(candidate.reportingUrl) ?? (accepted.size > 0 ? [...accepted.values()][0].url : null)) : null;
  let email: string | null = null;
  let emailSourceUrl: string | null = null;
  if (organization && candidate.email && emailUrl && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(candidate.email) && pages.get(emailUrl)?.publishedEmails.has(candidate.email.toLowerCase())) {
    email = candidate.email;
    emailSourceUrl = emailUrl;
  } else if (organization) {
    // Fall back to an inbox the office's own pages publish. Most of these pages were prefetched during formatting.
    const scanUrls = [...new Set([reportingUrl, coverageUrl, emailUrl, phoneUrl, ...officialUrls].filter((url): url is string => url !== null))];
    const unread = scanUrls.filter((url) => !pages.has(url)).slice(0, MAX_EXTRA_COVERAGE_PAGES);
    await Promise.all(unread.map(async (url) => { pages.set(url, await readPage(url, signal)); }));
    const inbox = publishedServiceInbox(scanUrls.map((url) => [url, pages.get(url)]));
    if (inbox) {
      email = inbox.email;
      emailSourceUrl = inbox.url;
    } else if (candidate.email) {
      warnings.push('We left out an email address we couldn’t find on the official page.');
    }
  }
  let phone: string | null = null;
  if (organization && candidate.phone && phoneUrl) {
    const digits = candidate.phone.replace(/\D/g, '');
    const pageText = pages.get(phoneUrl)?.text;
    const publishedPhones = pageText?.match(/\+?\d[\d\s().-]{5,}\d/g) || [];
    if (digits.length >= 7 && publishedPhones.some((published) => published.replace(/\D/g, '') === digits)) phone = candidate.phone;
  }

  if (research.issue.type === 'light_outage' && research.issue.photoLooksLikeDaytime && !research.issue.detailsSayLightIsOut) {
    warnings.push('The photo looks like daytime, so it can’t show the light is out. Say when you saw it dark.');
  }
  // Contacts belong in dedicated, provenance-checked fields, never unverified prose.
  const scrub = (text: string): string => text.replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi,
    (address) => email && address.toLowerCase() === email.toLowerCase() ? address : '[unverified email removed]');
  const seen = new Set<string>();
  const finalWarnings: string[] = [];
  for (const warning of [...warnings, ...research.warnings]) {
    const text = scrub(warning.trim());
    const key = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    finalWarnings.push(text);
    if (finalWarnings.length === MAX_WARNINGS) break;
  }
  const { photoLooksLikeDaytime: _daytime, detailsSayLightIsOut: _reportedOut, ...issue } = research.issue;
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    location: { ...input.location },
    issue: {
      ...issue,
      title: scrub(issue.title),
      summary: scrub(issue.summary),
      observations: issue.observations.map(scrub),
    },
    responsibility: {
      status, organization: organization ? scrub(organization) : null,
      department: department ? scrub(department) : null,
      email, emailSourceUrl, phone, reportingUrl, reason: scrub(reason),
    },
    sources: [...accepted.values()].map(({ title, url, note }) => ({ title: scrub(title), url, note: scrub(note) })),
    warnings: finalWarnings,
  };
}
