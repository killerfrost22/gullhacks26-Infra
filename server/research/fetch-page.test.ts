import assert from 'node:assert/strict';
import { PassThrough, Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { gzipSync } from 'node:zlib';
import {
  createPinnedTransport,
  decodeBody,
  fetchPage,
  isPublicAddress,
  PageLoadError,
  type PageTransport,
  type Resolver,
} from './fetch-page.js';

const PUBLIC_IP = '93.184.216.34';

function resolverFrom(table: Record<string, string[]>): Resolver {
  return async (hostname) => {
    const addresses = table[hostname];
    if (!addresses) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
    return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
}

function transportFrom(routes: Record<string, () => Response>, calls: string[] = []): PageTransport {
  return async (url) => {
    calls.push(url);
    const route = routes[url];
    if (!route) throw new TypeError('fetch failed');
    return route();
  };
}

const html = (body: string) =>
  new Response(`<html><head><title>Roads</title></head><body>${body}</body></html>`, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

describe('isPublicAddress', () => {
  it('rejects loopback, private, link-local, CGNAT, multicast, and ULA addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.5.4',
      '192.168.0.10',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.251',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      'fc12:3456::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:10.0.0.1',
      '64:ff9b::a00:1',
    ]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  it('accepts ordinary public addresses', () => {
    for (const address of [PUBLIC_IP, '8.8.8.8', '2606:4700:4700::1111', '::ffff:93.184.216.34']) {
      assert.equal(isPublicAddress(address), true, address);
    }
  });
});

describe('fetchPage', () => {
  const resolve = resolverFrom({ 'www.city.gov': [PUBLIC_IP], 'internal.example.com': ['10.0.0.5'] });

  it('refuses localhost, private IP literals, file:, other ports, and credentials before any request', async () => {
    const calls: string[] = [];
    const transport = transportFrom({}, calls);
    for (const url of [
      'http://localhost/',
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://192.168.1.1/admin',
      'http://169.254.169.254/latest/meta-data/',
      'file:///etc/passwd',
      'ftp://www.city.gov/',
      'https://www.city.gov:8443/',
      'https://user:pass@www.city.gov/',
      'http://internal.example.com/',
    ]) {
      await assert.rejects(fetchPage(url, { resolve, transport }), PageLoadError, url);
    }
    assert.deepEqual(calls, []);
  });

  it('re-checks every redirect hop and refuses a redirect into a private address', async () => {
    const calls: string[] = [];
    const transport = transportFrom(
      {
        'https://www.city.gov/start': () => new Response(null, { status: 302, headers: { location: 'http://internal.example.com/secret' } }),
      },
      calls,
    );
    await assert.rejects(fetchPage('https://www.city.gov/start', { resolve, transport }), /blocked address/);
    assert.deepEqual(calls, ['https://www.city.gov/start']);
  });

  it('follows up to 5 redirects and reports where the page landed', async () => {
    const routes: Record<string, () => Response> = {};
    for (let i = 0; i < 5; i += 1) {
      routes[`https://www.city.gov/r${i}`] = () =>
        new Response(null, { status: 301, headers: { location: `/r${i + 1}` } });
    }
    routes['https://www.city.gov/r5'] = () => html('<p>Hello&nbsp;there</p>');
    const page = await fetchPage('https://www.city.gov/r0', { resolve, transport: transportFrom(routes) });
    assert.equal(page.url, 'https://www.city.gov/r5');
    assert.equal(page.requestedUrl, 'https://www.city.gov/r0');
    assert.equal(page.title, 'Roads');
    assert.match(page.text, /Hello\u00a0?\s?there/);

    routes['https://www.city.gov/r5'] = () => new Response(null, { status: 302, headers: { location: '/r6' } });
    routes['https://www.city.gov/r6'] = () => html('too far');
    await assert.rejects(fetchPage('https://www.city.gov/r0', { resolve, transport: transportFrom(routes) }), /too many redirects/);
  });

  it('accepts only text/html or text/plain, under 2 MB, with a 2xx status', async () => {
    const transport = transportFrom({
      'https://www.city.gov/doc.pdf': () => new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }),
      'https://www.city.gov/huge': () =>
        new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers: { 'content-type': 'text/html' } }),
      'https://www.city.gov/missing': () => new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } }),
      'https://www.city.gov/plain': () => new Response('Call 311.', { headers: { 'content-type': 'text/plain' } }),
    });
    await assert.rejects(fetchPage('https://www.city.gov/doc.pdf', { resolve, transport }), /not a text page/);
    await assert.rejects(fetchPage('https://www.city.gov/huge', { resolve, transport }), /too large/);
    await assert.rejects(fetchPage('https://www.city.gov/missing', { resolve, transport }), /status 404/);
    assert.equal((await fetchPage('https://www.city.gov/plain', { resolve, transport })).text, 'Call 311.');
  });

  it('gives up on a page that takes too long', async () => {
    const transport: PageTransport = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
    await assert.rejects(fetchPage('https://www.city.gov/slow', { resolve, transport, timeoutMs: 20 }), /timed out/);
  });

  it('turns HTML into text and keeps mailto/tel targets', async () => {
    const transport = transportFrom({
      'https://www.city.gov/contact': () =>
        html(
          '<script>var x = "hidden@city.gov";</script><style>p{}</style><p>Roads &amp; Streets</p>' +
            '<a href="mailto:streets%40city.gov">Email us</a><a href="tel:+1-301-555-0100">Call</a>',
        ),
    });
    const page = await fetchPage('https://www.city.gov/contact', { resolve, transport });
    assert.match(page.text, /Roads & Streets/);
    assert.doesNotMatch(page.text, /hidden@city\.gov/);
    assert.deepEqual(page.linkedContacts, ['streets@city.gov', '+1-301-555-0100']);
  });
});

describe('createPinnedTransport', () => {
  it('refuses to connect when the hostname resolves to a private address', async () => {
    const transport = createPinnedTransport(resolverFrom({ 'rebind.example.com': ['127.0.0.1'] }));
    await assert.rejects(
      transport('http://rebind.example.com/', { headers: {}, signal: AbortSignal.timeout(2000), redirect: 'manual' }),
      /blocked address/,
    );
  });
});

describe('decodeBody', () => {
  it('fails promptly when a compressed body is cut off halfway, instead of waiting forever', async () => {
    for (const encoding of ['gzip', 'deflate', 'br']) {
      const zipped = gzipSync(Buffer.from('<p>'.repeat(50_000)));
      const source = new PassThrough();
      const decoded = decodeBody(source, encoding);
      // Node's web stream type is structurally the DOM ReadableStream; the cast bridges the two lib typings.
      const reader = (Readable.toWeb(decoded) as unknown as ReadableStream<Uint8Array>).getReader();
      const reading = (async () => {
        for (;;) if ((await reader.read()).done) return 'ended';
      })();
      if (encoding === 'gzip') source.write(zipped.subarray(0, zipped.length >> 1));
      await new Promise((resolve) => setImmediate(resolve)); // let the half body reach the decoder
      source.destroy(new Error('socket closed'));
      // The bug was a reader that never settles, so only a wall-clock guard can tell "hung" from "slow".
      const outcome = await Promise.race([
        reading.then(
          () => 'ended',
          () => 'failed',
        ),
        new Promise((resolve) => setTimeout(() => resolve('hung'), 1_000).unref()),
      ]);
      assert.equal(outcome, 'failed', encoding);
    }
  });

  it('passes an unencoded body through untouched', () => {
    const source = new PassThrough();
    assert.equal(decodeBody(source, ''), source);
  });
});
