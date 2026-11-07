import test from 'node:test';
import assert from 'node:assert/strict';
import {
  campusCandidates, createLocationContextLookup, geometryContains, mergeContext, overpassQuery, parseCensus, parseNominatimContext, parseOverpass,
} from './context.js';
import type { ContextProviders, OverpassFacts } from './context.js';

const lat = 38.9886;
const lon = -76.9365;

const overpassResponse = {
  elements: [
    { type: 'area', id: 1, tags: { boundary: 'administrative', admin_level: '2', name: 'United States', 'ISO3166-1': 'US' } },
    { type: 'area', id: 2, tags: { boundary: 'administrative', admin_level: '4', name: 'Maryland' } },
    { type: 'area', id: 3, tags: { boundary: 'administrative', admin_level: '6', name: "Prince George's County" } },
    { type: 'area', id: 4, tags: { boundary: 'administrative', admin_level: '8', name: 'College Park' } },
    { type: 'area', id: 5, tags: { amenity: 'university', name: 'University of Maryland', operator: 'University System of Maryland', website: 'https://umd.edu/' } },
    // An unnamed link right at the point should not beat the named road a few metres away.
    { type: 'way', id: 10, tags: { highway: 'tertiary_link' }, geometry: [{ lat: 38.98861, lon: -76.93651 }, { lat: 38.98862, lon: -76.93640 }] },
    { type: 'way', id: 11, tags: { highway: 'tertiary', name: 'Campus Drive', operator: 'University of Maryland' },
      geometry: [null, { lat: 38.98855, lon: -76.93664 }, { lat: 38.98851, lon: -76.93581 }, null] },
    { type: 'way', id: 12, tags: { highway: 'footway', name: 'Gate Path' }, geometry: [{ lat: 38.9886, lon: -76.9365 }, { lat: 38.9887, lon: -76.9365 }] },
    { type: 'node', id: 20, lat: 38.98875, lon: -76.9365, tags: { highway: 'street_lamp', operator: 'Pepco', ref: 'P-9' } },
    { type: 'node', id: 21, lat: 38.98861, lon: -76.9365, tags: { highway: 'street_lamp', lamp_ref: '1234' } },
  ],
};

test('Overpass facts pick the nearest named drivable road, the enclosing campus, nearby lamps, and admin areas', () => {
  const facts = parseOverpass(lat, lon, overpassResponse);
  assert.deepEqual(facts.road, { name: 'Campus Drive', ref: null, kind: 'tertiary', operator: 'University of Maryland' });
  assert.deepEqual(facts.campus, { name: 'University of Maryland', operator: 'University System of Maryland', website: 'https://umd.edu/' });
  assert.deepEqual(facts.streetLights, [{ operator: null, ref: '1234' }, { operator: 'Pepco', ref: 'P-9' }]);
  assert.deepEqual(facts.place, { municipality: 'College Park', county: "Prince George's County", state: 'Maryland', country: 'United States', countryCode: 'us' });
  const unincorporated = parseOverpass(lat, lon, { elements: overpassResponse.elements.filter((element) => element.id !== 4) });
  assert.equal(unincorporated.place.municipality, null);
  assert.throws(() => parseOverpass(lat, lon, { elements: [], remark: 'runtime error: Query timed out in "query" at line 3' }));
  assert.match(overpassQuery(lat, lon), /is_in\(38\.988600,-76\.936500\)/);
});

test('private roads are flagged in the road kind; Census marks incorporation, including active townships', () => {
  const facts = parseOverpass(lat, lon, { elements: [
    { type: 'way', tags: { highway: 'service', name: 'Mall Loop', access: 'private' }, geometry: [{ lat, lon }, { lat: lat + 0.0001, lon }] },
  ] });
  assert.equal(facts.road?.kind, 'service (private access)');
  assert.deepEqual(parseCensus({ result: { geographies: {
    States: [{ NAME: 'Maryland' }], Counties: [{ NAME: "Prince George's County" }],
    'County Subdivisions': [{ NAME: 'District 21, Berwyn', FUNCSTAT: 'N' }], 'Incorporated Places': [{ NAME: 'College Park city', BASENAME: 'College Park' }],
  } } }), { municipality: 'College Park', county: "Prince George's County", state: 'Maryland' });
  assert.equal(parseCensus({ result: { geographies: {
    States: [{ NAME: 'New Jersey' }], Counties: [{ NAME: 'Mercer County' }], 'County Subdivisions': [{ NAME: 'Hamilton township', FUNCSTAT: 'A' }], 'Incorporated Places': [],
  } } })?.municipality, 'Hamilton township');
  assert.equal(parseCensus({ result: { geographies: { States: [{ NAME: 'Maryland' }], 'Incorporated Places': [] } } })?.municipality, null);
  assert.equal(parseCensus({ result: { geographies: {} } }), null);
});

test('provider fallbacks: Census outranks map boundaries in the US, Nominatim fills gaps, failures leave nulls', () => {
  const nominatimFacts = parseNominatimContext({
    category: 'highway', type: 'primary', name: 'Baltimore Avenue', namedetails: { ref: 'US 1' }, extratags: { operator: 'Maryland SHA' },
    address: { road: 'Baltimore Avenue', city: 'College Park', county: "Prince George's County", state: 'Maryland', country: 'United States', country_code: 'us' },
  });
  assert.deepEqual(nominatimFacts.road, { name: 'Baltimore Avenue', ref: 'US 1', kind: 'primary', operator: 'Maryland SHA' });
  assert.equal(nominatimFacts.place.municipality, null, 'Nominatim cannot tell incorporated US places apart.');
  const overpass = parseOverpass(lat, lon, overpassResponse);
  const census = { municipality: null, county: "Prince George's County", state: 'Maryland' };
  const merged = mergeContext(overpass, census, nominatimFacts);
  assert.equal(merged.place.municipality, null);
  assert.equal(merged.road?.name, 'Campus Drive');
  assert.equal(mergeContext(undefined, undefined, nominatimFacts).road?.ref, 'US 1');
  const noRoad: OverpassFacts = { ...overpass, road: null };
  assert.equal(mergeContext(noRoad, census, nominatimFacts).road, null, 'No mapped road within 20 m is itself a clue.');
  assert.deepEqual(mergeContext(undefined, undefined, undefined), {
    road: null, campus: null, streetLights: [],
    place: { municipality: null, county: null, state: null, country: null, countryCode: null },
  });
  const french = parseNominatimContext({ address: { road: 'Rue de Rivoli', city: 'Paris', state: 'Île-de-France', country: 'France', country_code: 'fr' } });
  assert.equal(mergeContext(undefined, null, french).place.municipality, 'Paris');
});

test('lookups are shared while in flight, cached by rounded coordinates, bounded, expire, and skip caching total failures', async () => {
  let time = 0;
  let calls = 0;
  let fail = false;
  const providers: ContextProviders = {
    async overpass() { calls++; if (fail) throw new Error('down'); return parseOverpass(lat, lon, overpassResponse); },
    async census() { if (fail) throw new Error('down'); return null; },
    async nominatim() { throw new Error('busy'); },
    async campus() { return null; },
  };
  const lookup = createLocationContextLookup({ providers, now: () => time, ttlMs: 1000, maxEntries: 2 });
  const [first, second] = await Promise.all([lookup(lat, lon), lookup(lat + 0.000001, lon)]);
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal(first.campus?.name, 'University of Maryland');
  await lookup(lat, lon);
  assert.equal(calls, 1);
  time = 1001;
  await lookup(lat, lon);
  assert.equal(calls, 2, 'Expired entries are looked up again.');
  await lookup(1, 1);
  await lookup(2, 2);
  await lookup(lat, lon);
  assert.equal(calls, 5, 'The oldest entry is evicted once the cache is full.');
  fail = true;
  const empty = await lookup(3, 3);
  assert.equal(empty.road, null);
  await lookup(3, 3);
  assert.equal(calls, 7, 'A lookup where every provider failed is retried next time.');
});

test('campus fallback: largest enclosing outline first, and a bounding box alone never names a campus', () => {
  const search = [
    { name: 'School of Public Policy', osm_type: 'way', osm_id: 11, category: 'amenity', type: 'university', boundingbox: ['38.985', '38.987', '-76.946', '-76.943'] },
    { name: 'University of Maryland, College Park', osm_type: 'relation', osm_id: 22, category: 'amenity', type: 'university', boundingbox: ['38.967', '39.008', '-76.966', '-76.918'] },
    { name: 'Faraway College', osm_type: 'way', osm_id: 33, category: 'amenity', type: 'college', boundingbox: ['38.990', '38.995', '-76.940', '-76.930'] },
    { name: 'Campus Kiosk', osm_type: 'node', osm_id: 44, category: 'amenity', type: 'university', boundingbox: ['38.9858', '38.9860', '-76.9448', '-76.9446'] },
    { name: 'College Avenue', osm_type: 'way', osm_id: 55, category: 'highway', type: 'residential', boundingbox: ['38.98', '38.99', '-76.95', '-76.94'] },
  ];
  assert.deepEqual(campusCandidates(38.9859, -76.9447, search), [
    { name: 'University of Maryland, College Park', osmId: 'R22' },
    { name: 'School of Public Policy', osmId: 'W11' },
  ]);
  // An L-shaped campus: its bounding box covers the empty corner, its outline does not.
  const lShape = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]]] };
  assert.equal(geometryContains(lShape, 0.5, 0.5), true);
  assert.equal(geometryContains(lShape, 1.5, 1.5), false, 'inside the bounding box but outside the campus');
  const withQuad = { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]] };
  assert.equal(geometryContains(withQuad, 2, 2), false, 'a hole in the outline is not campus');
  const split = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]]] };
  assert.equal(geometryContains(split, 5.5, 5.5), true);
  assert.equal(geometryContains({ type: 'Point', coordinates: [0.5, 0.5] }, 0.5, 0.5), false);
  const fallback = { name: 'University of Maryland, College Park', operator: null, website: null };
  assert.equal(mergeContext(undefined, null, undefined, fallback).campus, fallback);
  assert.equal(mergeContext(parseOverpass(lat, lon, overpassResponse), null, undefined, fallback).campus?.name, 'University of Maryland', 'Overpass wins when it answers');
});
