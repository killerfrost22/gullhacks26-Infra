import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { pipeline, Readable } from 'node:stream';
import zlib from 'node:zlib';
import { htmlToPage } from './html.js';

/** Resolves a hostname to every address it points at. Injected so tests never touch real DNS. */
export type Resolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

/** The subset of `fetch` the page loader uses. `globalThis.fetch` fits; tests pass a fake. */
export type PageTransport = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal; redirect: 'manual' },
) => Promise<Response>;

export interface FetchPageOptions {
  resolve: Resolver;
  transport: PageTransport;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface FetchedPage {
  /** The URL that was asked for. */
  requestedUrl: string;
  /** Where the page actually lives after redirects. */
  url: string;
  title: string | null;
  text: string;
  /** `mailto:` and `tel:` targets, which count as published even when the link text hides them. */
  linkedContacts: string[];
}

export const PAGE_TIMEOUT_MS = 6_000;
export const PAGE_MAX_BYTES = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
const USER_AGENT = 'FixPlease/1.0 (+https://fixplease.work; source check)';

export class PageLoadError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'PageLoadError';
  }
}

// ---------------------------------------------------------------- address checks

const blockedV4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  blockedV4.addSubnet(network, prefix, 'ipv4');
}

const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ['::', 96], // unspecified, loopback, IPv4-compatible
  ['100::', 64], // discard
  ['2001::', 32], // Teredo tunnels can reach arbitrary IPv4 hosts
  ['2001:db8::', 32],
  ['2002::', 16], // 6to4 embeds an IPv4 address
  ['fc00::', 7], // unique local (ULA)
  ['fe80::', 10], // link-local
  ['fec0::', 10], // old site-local
  ['ff00::', 8], // multicast
] as const) {
  blockedV6.addSubnet(network, prefix, 'ipv6');
}

/** Expands a valid IPv6 literal (already checked with `isIP`) into its eight 16-bit groups. */
function ipv6Hextets(address: string): number[] | null {
  let text = address;
  const dotted = text.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const octets = dotted[2].split('.').map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    text = `${dotted[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...new Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  const values = groups.map((group) => (/^[0-9a-f]{1,4}$/i.test(group) ? parseInt(group, 16) : Number.NaN));
  return values.some(Number.isNaN) ? null : values;
}

/** True when the address is public unicast: not loopback, private, link-local, CGNAT, multicast, or ULA. */
export function isPublicAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '').split('%')[0];
  const family = isIP(bare);
  if (family === 4) return !blockedV4.check(bare, 'ipv4');
  if (family !== 6) return false;
  const hextets = ipv6Hextets(bare);
  if (!hextets) return false;
  const embedsV4 =
    (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) || // IPv4-mapped
    (hextets[0] === 0x64 && hextets[1] === 0xff9b && hextets.slice(2, 6).every((h) => h === 0)); // NAT64
  if (embedsV4) {
    const v4 = [hextets[6] >> 8, hextets[6] & 0xff, hextets[7] >> 8, hextets[7] & 0xff].join('.');
    return !blockedV4.check(v4, 'ipv4');
  }
  return !blockedV6.check(bare, 'ipv6');
}

export const systemResolver: Resolver = async (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

/** Resolves a host and refuses it unless every address is public. Literal IPs are checked directly. */
export async function resolvePublicAddresses(hostname: string, resolve: Resolver) {
  const bare = hostname.replace(/^\[|\]$/g, '');
  const family = isIP(bare);
  if (family) {
    if (!isPublicAddress(bare)) throw new PageLoadError('blocked address');
    return [{ address: bare, family }];
  }
  if (bare === 'localhost' || bare.endsWith('.localhost')) throw new PageLoadError('blocked address');
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await resolve(bare);
  } catch {
    throw new PageLoadError('dns failed');
  }
  if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new PageLoadError('blocked address');
  }
  return addresses;
}

/** Throws unless the URL is plain http(s) on port 80/443 without embedded credentials. */
export function assertFetchableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PageLoadError('bad url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new PageLoadError('scheme not allowed');
  if (url.port !== '' && url.port !== '80' && url.port !== '443') throw new PageLoadError('port not allowed');
  if (url.username || url.password) throw new PageLoadError('credentials not allowed');
  url.hash = '';
  return url;
}

// ---------------------------------------------------------------- transport

/**
 * Decodes gzip/deflate/br bodies. `pipeline` (not `pipe`) so a source that closes early, e.g. on timeout or abort,
 * destroys the decoder with an error instead of leaving readers waiting forever.
 */
export function decodeBody(source: Readable, contentEncoding: string): Readable {
  const encoding = contentEncoding.toLowerCase().trim();
  const decoder =
    encoding === 'gzip' || encoding === 'x-gzip'
      ? zlib.createGunzip()
      : encoding === 'deflate'
        ? zlib.createInflate()
        : encoding === 'br'
          ? zlib.createBrotliDecompress()
          : null;
  if (!decoder) return source;
  // Errors surface on the returned stream; the callback only keeps them from being reported as unhandled.
  return pipeline(source, decoder, () => undefined);
}

/**
 * Production transport: plain node:http(s) whose DNS lookup goes through the same public-address check,
 * so the socket connects to exactly the address that was approved (no DNS-rebinding gap between check and connect).
 */
export function createPinnedTransport(resolve: Resolver): PageTransport {
  return (rawUrl, init) => {
    // tsconfig targets ES2023, so no Promise.withResolvers.
    let settle!: (response: Response) => void;
    let fail!: (error: unknown) => void;
    const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
      settle = resolvePromise;
      fail = rejectPromise;
    });
    const url = new URL(rawUrl);
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      url,
      {
        method: 'GET',
        headers: { ...init.headers, 'accept-encoding': 'gzip, deflate, br' },
        signal: init.signal,
        lookup: (hostname, options, callback) => {
          resolvePublicAddresses(hostname, resolve).then(
            (addresses) => {
              if (options.all) callback(null, addresses);
              else callback(null, addresses[0].address, addresses[0].family);
            },
            (error: Error) => callback(error, '', 0),
          );
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status > 599) {
          response.destroy();
          fail(new PageLoadError('bad status'));
          return;
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (value === undefined) continue;
          for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
        }
        const stream = decodeBody(response, response.headers['content-encoding'] ?? '');
        // The body is handed over decoded, so the original length and encoding no longer describe it.
        headers.delete('content-encoding');
        headers.delete('content-length');
        const empty = status === 204 || status === 205 || status === 304;
        if (empty) response.resume();
        // Node's web stream type is structurally the DOM ReadableStream; the cast bridges the two lib typings.
        const body = empty ? null : (Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>);
        settle(new Response(body, { status, headers }));
      },
    );
    request.on('error', fail);
    request.end();
    return promise;
  };
}

// ---------------------------------------------------------------- page loading

async function readCapped(response: Response, limit: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => undefined);
    throw new PageLoadError('too large');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new PageLoadError('too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function decode(bytes: Uint8Array, contentType: string): string {
  const charset = contentType.match(/charset\s*=\s*"?([^";\s]+)/i)?.[1];
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * Loads a public web page the way a cautious browser would: http(s) only, ports 80/443, public addresses only
 * (re-checked on every redirect), at most 5 redirects, ~6 s, 2 MB, and only text/html or text/plain.
 */
export async function fetchPage(rawUrl: string, options: FetchPageOptions): Promise<FetchedPage> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? PAGE_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let url = assertFetchableUrl(rawUrl);
  for (let hop = 0; ; hop += 1) {
    await resolvePublicAddresses(url.hostname, options.resolve);
    let response: Response;
    try {
      response = await options.transport(url.href, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain;q=0.9' },
        signal,
        redirect: 'manual',
      });
    } catch (error) {
      if (error instanceof PageLoadError) throw error;
      throw new PageLoadError(signal.aborted ? 'timed out' : 'network error');
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new PageLoadError('redirect without location');
      if (hop >= MAX_REDIRECTS) throw new PageLoadError('too many redirects');
      url = assertFetchableUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new PageLoadError(`status ${response.status}`);
    }
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const isHtml = contentType.startsWith('text/html');
    if (!isHtml && !contentType.startsWith('text/plain')) {
      await response.body?.cancel().catch(() => undefined);
      throw new PageLoadError('not a text page');
    }
    let bytes: Uint8Array;
    try {
      bytes = await readCapped(response, PAGE_MAX_BYTES);
    } catch (error) {
      if (error instanceof PageLoadError) throw error;
      throw new PageLoadError(signal.aborted ? 'timed out' : 'network error');
    }
    const raw = decode(bytes, contentType);
    const page = isHtml ? htmlToPage(raw) : { title: null, text: raw, linkedContacts: [] };
    return { requestedUrl: rawUrl, url: url.href, ...page };
  }
}
