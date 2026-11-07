import type { PublishedContact } from '../../shared/types.js';
import { fetchPage, type FetchedPage, type PageTransport, type Resolver } from './fetch-page.js';
import { normalizeForMatch } from './html.js';
import {
  emailDomain,
  findEmails,
  findPhoneDigits,
  formatPhone,
  hostOf,
  isAcceptableContactEmail,
  isOfficialPageHost,
  isRepairInbox,
  phoneDigits,
  sameOfficeDomain,
} from './provenance.js';

/** A page the server loaded during this report. */
export interface LoadedPage extends FetchedPage {
  /** Google Search returned this link (directly or through its redirector). */
  searchReturned: boolean;
  /** Title Google gave the link, used when the page has no `<title>`. */
  searchTitle: string | null;
  /** Public-sector domain or the campus's own website. */
  official: boolean;
  host: string;
  normalizedText: string;
  emails: string[];
  phones: Set<string>;
}

export interface LoadOptions {
  resolve: Resolver;
  transport: PageTransport;
  signal: AbortSignal;
  campusHost: string | null;
  timeoutMs?: number;
}

export interface PageRequest {
  url: string;
  searchReturned: boolean;
  searchTitle?: string | null;
}

/** URL identity for matching a cited link to a loaded page: no fragment, no trailing slash. */
export function urlKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** Loads pages in parallel. Pages that fail any safety or loading check are simply absent from the result. */
export async function loadPages(requests: PageRequest[], options: LoadOptions): Promise<LoadedPage[]> {
  const settled = await Promise.allSettled(
    requests.map(async (request): Promise<LoadedPage> => {
      const page = await fetchPage(request.url, {
        resolve: options.resolve,
        transport: options.transport,
        signal: options.signal,
        timeoutMs: options.timeoutMs,
      });
      const host = hostOf(page.url) ?? '';
      const contactText = `${page.text}\n${page.linkedContacts.join('\n')}`;
      return {
        ...page,
        searchReturned: request.searchReturned,
        searchTitle: request.searchTitle ?? null,
        official: isOfficialPageHost(host, options.campusHost),
        host,
        normalizedText: normalizeForMatch(page.text),
        emails: findEmails(contactText),
        phones: findPhoneDigits(contactText),
      };
    }),
  );
  return settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

export function findPage(pages: LoadedPage[], url: string | null): LoadedPage | undefined {
  const key = url ? urlKey(url) : null;
  if (!key) return undefined;
  return pages.find((page) => urlKey(page.requestedUrl) === key || urlKey(page.url) === key);
}

const MIN_QUOTE_WORDS = 5;

/** The quote with wrapping quotation marks removed, as it should appear on the page. */
export function cleanQuote(quote: string): string {
  return quote.trim().replace(/^["'\u201c\u201d\u2018\u2019\u00ab\u00bb\s]+|["'\u201c\u201d\u2018\u2019\u00ab\u00bb\s]+$/g, '');
}

/** Word for word after folding whitespace, nbsp, soft hyphens, curly quotes, dashes, and case. */
export function quoteOnPage(quote: string, page: LoadedPage): boolean {
  const needle = normalizeForMatch(cleanQuote(quote));
  if (needle.split(' ').length < MIN_QUOTE_WORDS) return false;
  return page.normalizedText.includes(needle);
}

/** Pages to check in order: the one the model cited first, then every other page, without repeats. */
function preferring(page: LoadedPage | undefined, pages: LoadedPage[]): LoadedPage[] {
  return page ? [page, ...pages.filter((other) => other !== page)] : pages;
}

/**
 * Keeps an email only if it is printed on a loaded official page and is a repair/service inbox or a general office
 * inbox (`info@`), never a person's or a press, HR, or web mailbox.
 */
export function verifyEmail(value: string | null, cited: LoadedPage | undefined, pages: LoadedPage[]): PublishedContact | null {
  const email = value ? findEmails(value)[0] : undefined;
  if (!email || !isAcceptableContactEmail(email)) return null;
  const page = preferring(cited, pages).find((candidate) => candidate.official && candidate.emails.includes(email));
  return page ? { value: email, sourceUrl: page.url } : null;
}

/** Keeps a phone number only if the same digits are printed on a loaded official page. The value shown is rebuilt from digits. */
export function verifyPhone(value: string | null, cited: LoadedPage | undefined, pages: LoadedPage[]): PublishedContact | null {
  if (!value) return null;
  // Take the first number in the text, so "(301) 555-0100, ask for Bob, ext 2" yields only the number.
  const number = value.match(/\+?\d[\d\s().\-\u2010-\u2013]{5,18}\d/)?.[0] ?? value.match(/\b[2-9]11\b/)?.[0];
  if (!number) return null;
  const digits = phoneDigits(number);
  if (digits.length !== 3 && (digits.length < 7 || digits.length > 15)) return null;
  const page = preferring(cited, pages).find((candidate) => candidate.official && candidate.phones.has(digits));
  return page ? { value: formatPhone(number), sourceUrl: page.url } : null;
}

/** First repair or service inbox printed on a loaded official page whose domain is the office's own host (or its parent/subdomain). */
export function findRepairInbox(pages: LoadedPage[], officeHosts: string[]): PublishedContact | null {
  if (officeHosts.length === 0) return null;
  for (const page of pages) {
    if (!page.official) continue;
    const email = page.emails.find(
      (candidate) => isRepairInbox(candidate) && officeHosts.some((host) => sameOfficeDomain(emailDomain(candidate), host)),
    );
    if (email) return { value: email, sourceUrl: page.url };
  }
  return null;
}
