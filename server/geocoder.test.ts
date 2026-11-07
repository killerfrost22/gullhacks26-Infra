import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { searchLocations, reverseLocation } from './geocoder.js';

test('overlapping searches and reverse lookups share a one-per-second gate, preserve zero, and never retry', async () => {
  const starts: number[] = [];
  const server = createServer((request, response) => {
    starts.push(Date.now());
    response.setHeader('Content-Type', 'application/json');
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.searchParams.get('q') === 'rate limited') {
      response.writeHead(429).end('{"error":"limited"}');
      return;
    }
    const place = { lat: '0', lon: '0', display_name: 'Global test point' };
    response.end(JSON.stringify(url.pathname === '/reverse' ? place : [place]));
  }).listen(0, '127.0.0.1');
  const previousBase = process.env.NOMINATIM_BASE_URL;
  try {
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    process.env.NOMINATIM_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const signal = new AbortController().signal;
    const [search, reverse] = await Promise.all([searchLocations('global point', signal), reverseLocation(0, 180, signal)]);
    assert.equal(search[0].latitude, 0);
    assert.equal(reverse.latitude, 0);
    assert.equal(reverse.longitude, 180);
    assert.equal(starts.length, 2);
    assert.ok(starts[1] - starts[0] >= 1000, 'Overlapping endpoints must share the global provider gate.');
    await assert.rejects(searchLocations('rate limited', signal), (error: unknown) => error instanceof Error && error.message.includes('rate limited'));
    assert.equal(starts.length, 3, 'A provider error must not trigger an automatic retry.');
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(searchLocations('cancelled lookup', controller.signal));
    assert.equal(starts.length, 3, 'Already-aborted lookups must not reach the provider.');
  } finally {
    if (previousBase === undefined) delete process.env.NOMINATIM_BASE_URL;
    else process.env.NOMINATIM_BASE_URL = previousBase;
    await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeIdleConnections(); });
  }
});

test('local settlement names take precedence over broader municipal city boundaries', async () => {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify([{
      lat: '54.2469159', lon: '-6.9655357',
      display_name: 'Dublin Street, Monaghan, Monaghan Municipal District, County Monaghan, Ireland',
      address: {
        road: 'Dublin Street', town: 'Monaghan', city: 'Monaghan Municipal District',
        county: 'County Monaghan', country: 'Ireland',
      },
    }]));
  }).listen(0, '127.0.0.1');
  const previousBase = process.env.NOMINATIM_BASE_URL;
  try {
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    process.env.NOMINATIM_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const [result] = await searchLocations('Dublin Street, Monaghan', new AbortController().signal);
    assert.equal(result.address?.city, 'Monaghan');
  } finally {
    if (previousBase === undefined) delete process.env.NOMINATIM_BASE_URL;
    else process.env.NOMINATIM_BASE_URL = previousBase;
    await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeIdleConnections(); });
  }
});
