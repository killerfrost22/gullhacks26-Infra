import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { AreaFact, LocationContext, Place, PlaceAddress } from '../../shared/types';
import { contextFacts, shortPlace } from './place';

const emptyAddress: PlaceAddress = {
  houseNumber: null,
  road: null,
  locality: null,
  county: null,
  state: null,
  postcode: null,
  country: null,
  countryCode: null,
};

const place = (label: string, address: Partial<PlaceAddress> | null = {}): Place => ({
  latitude: 38.98972,
  longitude: -76.93776,
  label,
  address: address && { ...emptyAddress, ...address },
});

const context = (overrides: Partial<LocationContext> = {}): LocationContext => ({
  road: null,
  campus: null,
  streetLights: [],
  area: null,
  partial: false,
  ...overrides,
});

const area = (overrides: Partial<AreaFact>): AreaFact => ({
  municipality: null,
  municipalityKind: null,
  incorporation: 'unknown',
  county: null,
  state: null,
  country: null,
  countryCode: null,
  ...overrides,
});

describe('shortPlace', () => {
  test('house number, road, and locality', () => {
    assert.equal(
      shortPlace(place('ignored', { houseNumber: '4306', road: 'Campus Drive', locality: 'College Park' })),
      '4306 Campus Drive, College Park',
    );
  });

  test('a house number without a road is dropped', () => {
    assert.equal(shortPlace(place('ignored', { houseNumber: '12', locality: 'Hyattsville' })), 'Hyattsville');
  });

  test('falls back to campus, then the mapped road', () => {
    const campus = { name: 'University of Maryland', operator: null, website: null };
    const road = { name: 'Regents Drive', ref: null, kind: 'tertiary', operator: null, distanceMeters: 4 };
    assert.equal(shortPlace(place('x', { locality: 'College Park' }), context({ campus, road })), 'University of Maryland, College Park');
    assert.equal(shortPlace(place('x', null), context({ road })), 'Regents Drive');
  });

  test('uses the map-facts municipality as a bare name, never with a type word', () => {
    const areaContext = context({ area: area({ municipality: 'University Park', municipalityKind: 'town', incorporation: 'incorporated' }) });
    assert.equal(shortPlace(place('x', { houseNumber: '7', road: 'Pineway' }), areaContext), '7 Pineway, University Park');
  });

  test('cleans coordinates out of the label and never returns them', () => {
    assert.equal(shortPlace(place('4306, Campus Drive, College Park, Maryland', null)), '4306 Campus Drive, College Park');
    assert.equal(shortPlace(place('38°59\'23"N 76°56\'16"W', null)), 'Pinned spot');
    assert.equal(shortPlace(place('Lat: 38.98972, Lon: -76.93776', null)), 'Pinned spot');
    assert.equal(shortPlace(place('Regents Drive, 38.9897, -76.9378, College Park', null)), 'Regents Drive, College Park');
  });
});

describe('contextFacts', () => {
  test('road with its route number and operator', () => {
    const facts = contextFacts(
      context({ road: { name: 'Baltimore Avenue', ref: 'US 1;MD 201', kind: 'primary', operator: 'MDOT SHA', distanceMeters: 3 } }),
    );
    assert.deepEqual(facts, [{ kind: 'road', label: 'Baltimore Avenue', detail: 'US 1 / MD 201 · MDOT SHA' }]);
  });

  test('a road known only by its number', () => {
    const facts = contextFacts(context({ road: { name: null, ref: 'I 95', kind: 'motorway', operator: null, distanceMeters: 9 } }));
    assert.deepEqual(facts, [{ kind: 'road', label: 'I 95', detail: null }]);
  });

  test('the type word comes only from Census, never assumed', () => {
    const pg = { county: "Prince George's County", state: 'Maryland' };
    const label = (overrides: Partial<AreaFact>) => contextFacts(context({ area: area({ ...pg, ...overrides }) }))[0]?.label;

    assert.deepEqual(
      contextFacts(context({ area: area({ ...pg, municipality: 'College Park', municipalityKind: 'city', incorporation: 'incorporated' }) })),
      [{ kind: 'area', label: 'City of College Park', detail: "Prince George's County · Maryland" }],
    );
    assert.equal(label({ municipality: 'University Park', municipalityKind: 'town', incorporation: 'incorporated' }), 'Town of University Park');
    assert.equal(label({ municipality: 'Cheltenham', municipalityKind: 'township', incorporation: 'incorporated' }), 'Township of Cheltenham');
    assert.equal(label({ municipality: 'University Park', municipalityKind: null, incorporation: 'incorporated' }), 'University Park');
    assert.equal(label({ municipality: 'Somewhere', municipalityKind: 'CDP', incorporation: 'incorporated' }), 'Somewhere');

    const unincorporated = contextFacts(context({ area: area({ ...pg, municipality: 'Adelphi', incorporation: 'unincorporated' }) }));
    assert.deepEqual(unincorporated, [{ kind: 'area', label: "Unincorporated Prince George's County", detail: 'Maryland' }]);

    const unknown = contextFacts(context({ area: area({ municipality: 'Toronto', municipalityKind: 'city', incorporation: 'unknown', state: 'Ontario' }) }));
    assert.deepEqual(unknown, [{ kind: 'area', label: 'Toronto', detail: 'Ontario' }]);

    for (const kind of [null, 'town', 'village', 'borough', 'township', 'CDP']) {
      assert.doesNotMatch(label({ municipality: 'X', municipalityKind: kind, incorporation: 'incorporated' }) ?? '', /City of/);
    }
    for (const fact of [...unincorporated, ...unknown]) assert.doesNotMatch(fact.label, /City of/);
  });

  test('nearest street light with operator and pole number', () => {
    const facts = contextFacts(
      context({
        streetLights: [
          { operator: 'Pepco', ref: '4521', distanceMeters: 12.4 },
          { operator: null, ref: null, distanceMeters: 40 },
        ],
      }),
    );
    assert.deepEqual(facts, [{ kind: 'light', label: 'Street light 12 m away', detail: 'Pepco · pole 4521' }]);
  });

  test('campus, with its operator when it differs from the name', () => {
    const facts = contextFacts(
      context({ campus: { name: 'University of Maryland', operator: 'University System of Maryland', website: 'https://umd.edu' } }),
    );
    assert.deepEqual(facts, [{ kind: 'campus', label: 'University of Maryland', detail: 'University System of Maryland' }]);
  });

  test('no facts from an empty context', () => {
    assert.deepEqual(contextFacts(context({ partial: true })), []);
  });
});
