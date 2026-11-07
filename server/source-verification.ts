import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

export function canonicalSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || value.length > 2048) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    const groups = lower.split(':');
    const prefix = Number.parseInt(groups[0], 16);
    const subnet = Number.parseInt(groups[1] || '0', 16);
    // Permit global unicast only, excluding IETF special-purpose, documentation, and 6to4 ranges.
    return prefix >= 0x2000 && prefix <= 0x3fff &&
      !(prefix === 0x2001 && (subnet < 0x200 || subnet === 0xdb8)) && prefix !== 0x2002;
  }
  return false;
}

function decodeEntities(text: string): string {
  return text.replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (match: string, entity: string) => {
    const point = entity[0].toLowerCase() === 'x' ? parseInt(entity.slice(1), 16) : Number(entity);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
  }).replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

export function normalizedSourceText(text: string): string {
  return decodeEntities(text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

export interface VerifiedPage {
  text: string;
  publishedEmails: Set<string>;
}

const PAGE_DEADLINE_MS = 4000;
const MAX_PAGE_REDIRECTS = 2;

type PageFetch = { kind: 'page'; html: string } | { kind: 'redirect'; location: string };

async function fetchPublicPage(url: URL, signal: AbortSignal): Promise<PageFetch> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  ]);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('Non-public source address');
  signal.throwIfAborted();
  const address = addresses[0];
  return new Promise<PageFetch>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      signal,
      headers: { 'User-Agent': process.env.GEOCODER_USER_AGENT || 'FixPlease/1.0', Accept: 'text/html,text/plain' },
      family: address.family,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    }, (response) => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && typeof response.headers.location === 'string') {
        response.destroy();
        resolve({ kind: 'redirect', location: response.headers.location });
        return;
      }
      if (status !== 200 || !/^(text\/html|text\/plain|application\/xhtml\+xml)\b/i.test(String(response.headers['content-type'] || ''))) {
        response.destroy();
        reject(new Error('Source not readable'));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1_000_000) response.destroy(new Error('Source too large'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolve({ kind: 'page', html: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end();
  });
}

/**
 * Only called for URLs already returned by the provider's web search tools. DNS is pinned to a checked public address,
 * the whole read (including redirects) shares one short deadline, and redirects are followed only within the same site
 * (ignoring a www. prefix), so a cited page can never hand verification to an unrelated host.
 */
export async function readSourcePage(sourceUrl: string, signal: AbortSignal): Promise<VerifiedPage | null> {
  const canonical = canonicalSourceUrl(sourceUrl);
  if (!canonical) return null;
  const pageSignal = AbortSignal.any([signal, AbortSignal.timeout(PAGE_DEADLINE_MS)]);
  try {
    let url = new URL(canonical);
    const site = url.hostname.toLowerCase().replace(/^www\./, '');
    let html: string | null = null;
    for (let hop = 0; hop <= MAX_PAGE_REDIRECTS; hop++) {
      const result = await fetchPublicPage(url, pageSignal);
      if (result.kind === 'page') { html = result.html; break; }
      const next = canonicalSourceUrl(new URL(result.location, url).href);
      if (!next) return null;
      url = new URL(next);
      if (url.hostname.toLowerCase().replace(/^www\./, '') !== site) return null;
    }
    if (html === null) return null;
    const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
    const visibleAndLinks = decodeEntities(withoutScripts);
    const publishedEmails = new Set((visibleAndLinks.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi) || []).map((email) => email.toLowerCase()));
    return { text: normalizedSourceText(withoutScripts), publishedEmails };
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  }
}

/** Google Search grounding cites pages through opaque redirect URLs on this exact host and path prefix. */
export function isGroundingRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'vertexaisearch.cloud.google.com' && !url.port
      && !url.username && !url.password && url.pathname.startsWith('/grounding-api-redirect/');
  } catch { return false; }
}

const REDIRECT_TIMEOUT_MS = 2500;

/** Exactly one manual-redirect request to Google's grounding redirector; returns its canonical http(s) target, or null. */
export async function resolveGroundingRedirect(redirectUrl: string, signal: AbortSignal): Promise<string | null> {
  if (!isGroundingRedirect(redirectUrl)) return null;
  try {
    const response = await fetch(redirectUrl, {
      redirect: 'manual',
      signal: AbortSignal.any([signal, AbortSignal.timeout(REDIRECT_TIMEOUT_MS)]),
      headers: { 'User-Agent': process.env.GEOCODER_USER_AGENT || 'FixPlease/1.0' },
    });
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return null;
    const target = canonicalSourceUrl(new URL(location, redirectUrl).href);
    return target && !isGroundingRedirect(target) ? target : null;
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  }
}
