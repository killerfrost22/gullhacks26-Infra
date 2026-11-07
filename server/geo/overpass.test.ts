import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseOverpass } from './overpass.js';

const PIN = { latitude: 38.9897, longitude: -76.9378 };
/** Degrees of latitude per meter, close enough for test geometry. */
const M = 1 / 111_320;
const lonM = M / Math.cos((PIN.latitude * Math.PI) / 180);

function way(tags: Record<string, string>, geometry: Array<[number, number] | null>) {
  return {
    type: 'way',
    id: Math.floor(Math.random() * 1e9),
    tags,
    geometry: geometry.map((point) => (point ? { lat: PIN.latitude + point[0] * M, lon: PIN.longitude + point[1] * lonM } : null)),
  };
}

function lamp(northMeters: number, tags: Record<string, string> = {}) {
  return { type: 'node', id: Math.floor(Math.random() * 1e9), lat: PIN.latitude + northMeters * M, lon: PIN.longitude, tags: { highway: 'street_lamp', ...tags } };
}

describe('parseOverpass', () => {
  test('reports the nearest road by distance to its segments, with that road’s own ref', () => {
    const facts = parseOverpass(
      {
        elements: [
          // Listed first and carries a route number, but 60 m away.
          way({ highway: 'primary', name: 'Baltimore Avenue', ref: 'US 1', operator: 'Maryland State Highway Administration' }, [[60, -200], [60, 200]]),
          // Both vertices are 150 m away, but the segment passes 12 m south of the pin.
          way({ highway: 'tertiary', name: 'Campus Drive', operator: 'University of Maryland' }, [[-12, -150], [-12, 150]]),
          way({ highway: 'footway', name: 'Sidewalk' }, [[2, -10], [2, 10]]),
        ],
      },
      PIN,
    );
    assert.deepEqual(facts.road, {
      name: 'Campus Drive',
      ref: null,
      kind: 'tertiary',
      operator: 'University of Maryland',
      distanceMeters: 12,
    });
  });

  test('keeps the ref of a nearer numbered route and survives null geometry nodes', () => {
    const facts = parseOverpass(
      {
        elements: [
          way({ highway: 'residential', name: 'Knox Road' }, [[40, -50], [40, 50]]),
          way({ highway: 'secondary', name: 'University Boulevard', ref: 'MD 193' }, [null, [5, -30], [5, 30], null]),
        ],
      },
      PIN,
    );
    assert.equal(facts.road?.name, 'University Boulevard');
    assert.equal(facts.road?.ref, 'MD 193');
    assert.equal(facts.road?.distanceMeters, 5);
  });

  test('sorts street lights nearest first and keeps at most five', () => {
    const facts = parseOverpass(
      {
        elements: [
          lamp(30, { operator: 'Pepco', ref: 'P-30' }),
          lamp(-4, { operator: 'Pepco', lamp_ref: 'P-4' }),
          lamp(18),
          lamp(-25),
          lamp(9, { ref: 'P-9' }),
          lamp(38),
          { type: 'node', id: 1, lat: PIN.latitude, lon: PIN.longitude, tags: { highway: 'traffic_signals' } },
        ],
      },
      PIN,
    );
    assert.deepEqual(
      facts.streetLights.map((light) => light.distanceMeters),
      [4, 9, 18, 25, 30],
    );
    assert.deepEqual(facts.streetLights[0], { operator: 'Pepco', ref: 'P-4', distanceMeters: 4 });
    assert.equal(facts.streetLights[2].operator, null);
  });

  test('finds the campus the pin is inside, with a usable website', () => {
    const facts = parseOverpass(
      {
        elements: [
          { type: 'area', id: 3600000001, tags: { amenity: 'university', name: 'University of Maryland', operator: 'State of Maryland', website: 'www.umd.edu' } },
        ],
      },
      PIN,
    );
    assert.deepEqual(facts.campus, { name: 'University of Maryland', operator: 'State of Maryland', website: 'https://www.umd.edu/' });
    assert.equal(facts.road, null);
    assert.deepEqual(facts.streetLights, []);
  });

  test('treats a server-side timeout remark as a failure, not as "no roads"', () => {
    assert.throws(() => parseOverpass({ elements: [], remark: 'runtime error: Query timed out in "query" at line 2 after 8 seconds.' }, PIN));
    assert.throws(() => parseOverpass('<html>busy</html>', PIN));
  });
});
