import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { ApiError } from '../errors.js';
import { createGeoService } from './index.js';
import { NOMINATIM_HOST, deferred, geoEnv, installFetch, json, virtualClock } from './test-support.js';

const PIN = { latitude: 38.98971, longitude: -76.93782 };
const COORDINATE_PATTERN = /-?\d{1,3}\.\d{3,}/;

const campusDrive = {
  lat: '38.9897',
  lon: '-76.9378',
  name: '',
  display_name: '4306, Campus Drive, College Park, Prince George’s County, Maryland, 20742, United States',
  address: {
    house_number: '4306',
    road: 'Campus Drive',
    city: 'College Park',
    county: 'Prince George’s County',
    state: 'Maryland',
    postcode: '20742',
    country: 'United States',
    country_code: 'US',
  },
};

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

function fakeNominatim(handler: (url: URL) => Response | 'hang', clock = virtualClock()) {
  const fake = installFetch((url) => handler(url), clock);
  restore = fake.restore;
  return { fake, clock, geo: createGeoService({ clock, env: geoEnv }) };
}

describe('place labels', () => {
  test('builds the label from address parts and keeps the pin the user chose', async () => {
    const { geo } = fakeNominatim(() => json(campusDrive));
    const place = await geo.reversePlace(PIN);
    assert.deepEqual(place && { label: place.label, latitude: place.latitude, longitude: place.longitude }, {
      label: '4306 Campus Drive, College Park, Maryland',
      latitude: PIN.latitude,
      longitude: PIN.longitude,
    });
    assert.equal(place?.address?.countryCode, 'us');
    assert.equal(place?.address?.locality, 'College Park');
  });

  test('skips missing parts instead of inventing them', async () => {
    const { geo } = fakeNominatim((url) => {
      const q = url.searchParams.get('q');
      if (q === 'number only') {
        return json([{ lat: '39', lon: '-77', display_name: '12, Maryland, United States', address: { house_number: '12', state: 'Maryland' } }]);
      }
      return json([{ lat: '39', lon: '-77', display_name: 'Old Road, Maryland', address: { road: 'Old Road', state: 'Maryland' } }]);
    });
    const [roadOnly] = await geo.searchPlaces('road only');
    assert.equal(roadOnly.label, 'Old Road, Maryland');
    assert.equal(roadOnly.address?.locality, null);

    // A house number with no road means nothing on its own; it must not show up as "12".
    const [numberOnly] = await geo.searchPlaces('number only');
    assert.equal(numberOnly.label, 'Maryland, United States');
    for (const label of [roadOnly.label, numberOnly.label]) assert.doesNotMatch(label, /undefined|null|, ,|^,|,$/);
  });

  test('names a place when the result is a named spot, without repeating the road', async () => {
    const { geo } = fakeNominatim(() =>
      json([
        { lat: '38.98', lon: '-76.94', name: 'Stamp Student Union', address: { road: 'Campus Drive', city: 'College Park', state: 'Maryland' } },
        { lat: '38.98', lon: '-76.94', name: 'Campus Drive', address: { road: 'Campus Drive', city: 'College Park', state: 'Maryland' } },
      ]),
    );
    const labels = (await geo.searchPlaces('stamp')).map((place) => place.label);
    assert.deepEqual(labels, ['Stamp Student Union, Campus Drive, College Park, Maryland', 'Campus Drive, College Park, Maryland']);
  });

  test('never shows coordinates as a label', async () => {
    const coordinatesOnly = { lat: '38.9897', lon: '-76.9378', display_name: '38.98970, -76.93780', address: {} };
    const { geo } = fakeNominatim((url) =>
      url.pathname === '/reverse'
        ? json(coordinatesOnly)
        : json([coordinatesOnly, { ...campusDrive, name: '38.9897 N 76.9378 W' }]),
    );
    assert.equal(await geo.reversePlace(PIN), null);
    const places = await geo.searchPlaces('somewhere');
    assert.deepEqual(places.map((place) => place.label), ['4306 Campus Drive, College Park, Maryland']);
    for (const place of places) assert.doesNotMatch(place.label, COORDINATE_PATTERN);
  });

  test('returns null when the geocoder has no address for the pin', async () => {
    const { geo } = fakeNominatim(() => json({ error: 'Unable to geocode' }));
    assert.equal(await geo.reversePlace({ latitude: 0, longitude: -30 }), null);
  });
});

describe('Nominatim requests', () => {
  test('sends the configured User-Agent and the documented parameters', async () => {
    const { fake, geo } = fakeNominatim((url) => (url.pathname === '/search' ? json([]) : json(campusDrive)));
    await geo.searchPlaces('  Campus   Drive ');
    await geo.reversePlace(PIN);
    const [search, reverse] = fake.calls;
    assert.equal(new Headers(search.init.headers).get('User-Agent'), 'FixPlease/2.0 (local development)');
    assert.equal(search.url.searchParams.get('format'), 'jsonv2');
    assert.equal(search.url.searchParams.get('addressdetails'), '1');
    assert.equal(search.url.searchParams.get('limit'), '5');
    assert.equal(reverse.url.searchParams.get('zoom'), '18');
    assert.equal(reverse.url.searchParams.get('addressdetails'), '1');
  });

  test('one queue spaces search, reverse, and context lookups at least 1 s apart', async () => {
    const { fake, geo } = fakeNominatim((url) => {
      if (url.hostname !== NOMINATIM_HOST) return json({}, 503);
      return url.pathname === '/search' ? json([campusDrive]) : json(campusDrive);
    });
    await Promise.all([
      geo.searchPlaces('first'),
      geo.reversePlace(PIN),
      geo.searchPlaces('second'),
      geo.getLocationContext({ latitude: 40, longitude: -75 }),
    ]);
    const starts = fake.calls.filter((call) => call.url.hostname === NOMINATIM_HOST).map((call) => call.at ?? NaN);
    assert.equal(starts.length, 4);
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 1000, `gap ${starts[i] - starts[i - 1]} ms`);
  });

  test('a request cancelled while queued leaves without using a slot', async () => {
    const { fake, geo } = fakeNominatim(() => json([]));
    const controller = new AbortController();
    const first = geo.searchPlaces('first');
    const cancelled = geo.searchPlaces('cancelled', controller.signal);
    const third = geo.searchPlaces('third');
    controller.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    await Promise.all([first, third]);
    const queries = fake.calls.map((call) => call.url.searchParams.get('q'));
    assert.deepEqual(queries, ['first', 'third']);
    assert.equal((fake.calls[1].at ?? 0) - (fake.calls[0].at ?? 0), 1000);
  });

  test('provider failures become GEOCODER_UNAVAILABLE without provider text', async () => {
    const { geo } = fakeNominatim(() => new Response('upstream stack trace: secret', { status: 500 }));
    await assert.rejects(geo.searchPlaces('campus'), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 502);
      assert.equal(error.code, 'GEOCODER_UNAVAILABLE');
      assert.doesNotMatch(error.message, /secret|500|nominatim/i);
      return true;
    });
    await assert.rejects(geo.reversePlace(PIN), { code: 'GEOCODER_UNAVAILABLE' });
  });

  test('a cancelled request rejects as an abort, not a geocoder failure', async () => {
    const requested = deferred();
    const { geo } = fakeNominatim(() => {
      requested.resolve();
      return 'hang';
    });
    const controller = new AbortController();
    const pending = geo.reversePlace(PIN, controller.signal);
    await requested.promise;
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
  });

  test('caches search for 5 minutes by normalized query and reverse by the ~11 m grid', async () => {
    const { fake, clock, geo } = fakeNominatim((url) => (url.pathname === '/search' ? json([campusDrive]) : json(campusDrive)));
    await geo.searchPlaces('Campus Drive');
    await geo.searchPlaces('  campus   DRIVE ');
    assert.equal(fake.calls.length, 1);

    const near = await geo.reversePlace({ latitude: 38.989712, longitude: -76.937818 });
    const sameCell = await geo.reversePlace({ latitude: 38.989708, longitude: -76.937822 });
    assert.equal(fake.calls.length, 2);
    // The cached address is reused, but each answer keeps its own pin.
    assert.equal(sameCell?.latitude, 38.989708);
    assert.equal(near?.label, sameCell?.label);

    clock.advance(5 * 60_000 + 1);
    await geo.searchPlaces('campus drive');
    await geo.reversePlace({ latitude: 38.989712, longitude: -76.937818 });
    assert.equal(fake.calls.length, 3, 'search expires after 5 min, reverse still cached');
  });
});
