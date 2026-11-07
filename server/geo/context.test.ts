import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { createGeoService } from './index.js';
import {
  CENSUS_HOST,
  type FakeAnswer,
  deferred,
  NOMINATIM_HOST,
  OVERPASS_HOST,
  geoEnv,
  installFetch,
  json,
  virtualClock,
} from './test-support.js';

const UMD = { latitude: 38.9897, longitude: -76.9378 };
const M = 1 / 111_320;

const reverseOnCampus = {
  lat: '38.9897',
  lon: '-76.9378',
  category: 'amenity',
  type: 'university',
  name: 'University of Maryland',
  display_name: 'University of Maryland, Campus Drive, College Park, Maryland, United States',
  address: {
    amenity: 'University of Maryland',
    road: 'Campus Drive',
    town: 'College Park',
    county: "Prince George's County",
    state: 'Maryland',
    country: 'United States',
    country_code: 'us',
  },
  extratags: { website: 'https://umd.edu', operator: 'University System of Maryland' },
};

const overpassAnswer = {
  elements: [
    {
      type: 'way',
      tags: { highway: 'tertiary', name: 'Campus Drive' },
      geometry: [
        { lat: UMD.latitude - 10 * M, lon: UMD.longitude - 0.002 },
        { lat: UMD.latitude - 10 * M, lon: UMD.longitude + 0.002 },
      ],
    },
    { type: 'area', tags: { amenity: 'university', name: 'University of Maryland', website: 'https://umd.edu' } },
    { type: 'node', lat: UMD.latitude + 6 * M, lon: UMD.longitude, tags: { highway: 'street_lamp', operator: 'University of Maryland' } },
  ],
};

const censusIncorporated = {
  result: {
    geographies: {
      'Incorporated Places': [{ NAME: 'College Park city', BASENAME: 'College Park', FUNCSTAT: 'A' }],
      Counties: [{ NAME: "Prince George's County", FUNCSTAT: 'A' }],
      States: [{ NAME: 'Maryland', FUNCSTAT: 'A' }],
    },
  },
};

type Answers = Partial<Record<'nominatim' | 'overpass' | 'census', () => FakeAnswer>>;

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

function setup(answers: Answers = {}) {
  const clock = virtualClock();
  const fake = installFetch((url) => {
    if (url.hostname === NOMINATIM_HOST) return (answers.nominatim ?? (() => json(reverseOnCampus)))();
    if (url.hostname === OVERPASS_HOST) return (answers.overpass ?? (() => json(overpassAnswer)))();
    if (url.hostname === CENSUS_HOST) return (answers.census ?? (() => json(censusIncorporated)))();
    throw new Error(`unexpected request to ${url.hostname}`);
  }, clock);
  restore = fake.restore;
  return { fake, clock, geo: createGeoService({ clock, env: geoEnv }) };
}

describe('getLocationContext', () => {
  test('combines road, campus, lights, and city limits when every provider answers', async () => {
    const { geo } = setup();
    const context = await geo.getLocationContext(UMD);
    assert.deepEqual(context, {
      road: { name: 'Campus Drive', ref: null, kind: 'tertiary', operator: null, distanceMeters: 10 },
      campus: { name: 'University of Maryland', operator: null, website: 'https://umd.edu/' },
      streetLights: [{ operator: 'University of Maryland', ref: null, distanceMeters: 6 }],
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
    });
  });

  test('when Overpass fails, the campus comes from Nominatim and the context is partial', async () => {
    const { geo } = setup({ overpass: () => json({ remark: 'busy' }, 504) });
    const context = await geo.getLocationContext(UMD);
    assert.equal(context.partial, true);
    assert.equal(context.road, null);
    assert.deepEqual(context.streetLights, []);
    assert.deepEqual(context.campus, { name: 'University of Maryland', operator: 'University System of Maryland', website: 'https://umd.edu/' });
    assert.equal(context.area?.incorporation, 'incorporated');
  });

  test('skips Overpass for 60 s after a failure, then tries again', async () => {
    let overpassUp = false;
    const { fake, clock, geo } = setup({ overpass: () => (overpassUp ? json(overpassAnswer) : json({}, 429)) });
    await geo.getLocationContext(UMD);
    assert.equal(fake.count(OVERPASS_HOST), 1);

    overpassUp = true;
    clock.advance(59_000);
    const during = await geo.getLocationContext({ latitude: 39.1, longitude: -76.9 });
    assert.equal(fake.count(OVERPASS_HOST), 1, 'no Overpass request during backoff');
    assert.equal(during.partial, true);

    clock.advance(2_000);
    const after = await geo.getLocationContext({ latitude: 39.2, longitude: -76.9 });
    assert.equal(fake.count(OVERPASS_HOST), 2);
    assert.equal(after.partial, false);
    assert.equal(after.road?.name, 'Campus Drive');
  });

  test('when Census fails, the area comes from Nominatim and is marked unknown', async () => {
    const { geo } = setup({ census: () => new Response('Service Unavailable', { status: 503 }) });
    const context = await geo.getLocationContext(UMD);
    assert.equal(context.partial, true);
    assert.deepEqual(context.area, {
      municipality: 'College Park',
      municipalityKind: null,
      incorporation: 'unknown',
      county: "Prince George's County",
      state: 'Maryland',
      country: 'United States',
      countryCode: 'us',
    });
  });

  test('outside the U.S. the area is unknown without counting as a failure', async () => {
    const { geo } = setup({
      nominatim: () =>
        json({ lat: '43.66', lon: '-79.39', address: { road: 'College Street', city: 'Toronto', state: 'Ontario', country: 'Canada', country_code: 'ca' } }),
      overpass: () => json({ elements: [] }),
      census: () => json({ result: { geographies: {} } }),
    });
    const context = await geo.getLocationContext({ latitude: 43.66, longitude: -79.39 });
    assert.equal(context.partial, false);
    assert.deepEqual(context.area, {
      municipality: 'Toronto',
      municipalityKind: null,
      incorporation: 'unknown',
      county: null,
      state: 'Ontario',
      country: 'Canada',
      countryCode: 'ca',
    });
  });

  test('every provider failing gives an empty partial context instead of an error', async () => {
    const { geo } = setup({
      nominatim: () => {
        throw new TypeError('fetch failed');
      },
      overpass: () => {
        throw new TypeError('fetch failed');
      },
      census: () => json({ unexpected: true }),
    });
    const context = await geo.getLocationContext(UMD);
    assert.deepEqual(context, { road: null, campus: null, streetLights: [], area: null, partial: true });
  });

  test('a second lookup in the same ~11 m cell makes no new requests', async () => {
    const { fake, geo } = setup();
    const first = await geo.getLocationContext(UMD);
    const requests = fake.calls.length;
    assert.equal(requests, 3);
    const second = await geo.getLocationContext({ latitude: UMD.latitude + 0.00003, longitude: UMD.longitude - 0.00003 });
    assert.equal(fake.calls.length, requests);
    assert.deepEqual(second, first);
  });

  test('cancelling rejects, and does not put Overpass in backoff', async () => {
    const overpassAsked = deferred();
    let hang = true;
    const { fake, geo } = setup({
      overpass: () => {
        overpassAsked.resolve();
        return hang ? 'hang' : json(overpassAnswer);
      },
    });
    const controller = new AbortController();
    const pending = geo.getLocationContext(UMD, controller.signal);
    await overpassAsked.promise;
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });

    hang = false;
    const context = await geo.getLocationContext(UMD);
    assert.equal(fake.count(OVERPASS_HOST), 2);
    assert.equal(context.partial, false);
  });

  test('a caller deadline (AbortSignal.timeout, like the report’s 4 s wait) does not put Overpass in backoff', async () => {
    let hang = true;
    const { fake, geo } = setup({ overpass: () => (hang ? 'hang' : json(overpassAnswer)) });
    // A real AbortSignal.timeout is the point of this test: its TimeoutError reason is what used to start the backoff.
    await assert.rejects(geo.getLocationContext(UMD, AbortSignal.timeout(20)), { name: 'TimeoutError' });

    hang = false;
    const context = await geo.getLocationContext(UMD);
    assert.equal(fake.count(OVERPASS_HOST), 2, 'Overpass is asked again right away');
    assert.equal(context.partial, false);
    assert.equal(context.road?.name, 'Campus Drive');
  });

  test('a Census county without a government falls back to the geocoder’s county, else null', async () => {
    const greenwichCensus = {
      result: {
        geographies: {
          States: [{ NAME: 'Connecticut', BASENAME: 'Connecticut', FUNCSTAT: 'A' }],
          'County Subdivisions': [{ NAME: 'Greenwich town', BASENAME: 'Greenwich', FUNCSTAT: 'A', LSADC: '43' }],
          Counties: [{ NAME: 'Western Connecticut Planning Region', BASENAME: 'Western Connecticut', FUNCSTAT: 'N', LSADC: 'PL' }],
        },
      },
    };
    let county: string | undefined = 'Fairfield County';
    const { geo } = setup({
      nominatim: () =>
        json({ lat: '41.03', lon: '-73.63', address: { road: 'Greenwich Avenue', town: 'Greenwich', county, state: 'Connecticut', country: 'United States', country_code: 'us' } }),
      overpass: () => json({ elements: [] }),
      census: () => json(greenwichCensus),
    });
    const withCounty = await geo.getLocationContext({ latitude: 41.0262, longitude: -73.6282 });
    assert.equal(withCounty.area?.municipality, 'Greenwich');
    assert.equal(withCounty.area?.municipalityKind, 'town');
    assert.equal(withCounty.area?.incorporation, 'incorporated');
    assert.equal(withCounty.area?.county, 'Fairfield County');

    county = undefined;
    const without = await geo.getLocationContext({ latitude: 41.1, longitude: -73.6 });
    assert.equal(without.area?.county, null);
    assert.equal(without.area?.municipality, 'Greenwich');
  });
});
