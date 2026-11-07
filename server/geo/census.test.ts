import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCensus } from './census.js';

const county = { NAME: "Prince George's County", BASENAME: "Prince George's", FUNCSTAT: 'A' };
const state = { NAME: 'Maryland', BASENAME: 'Maryland', FUNCSTAT: 'A' };
// Shapes below are copied from live Census answers on Nov 7, 2026.
const marylandDistrict = { NAME: 'District 19, Riverdale', BASENAME: '19, Riverdale', FUNCSTAT: 'N', LSADC: '28' };

function answer(geographies: Record<string, unknown[]>) {
  return { result: { input: {}, geographies } };
}

test('an incorporated place is the municipality', () => {
  const area = parseCensus(
    answer({
      'Incorporated Places': [{ NAME: 'College Park city', BASENAME: 'College Park', FUNCSTAT: 'A', LSADC: '25' }],
      'Census Designated Places': [],
      Counties: [county],
      States: [state],
    }),
  );
  assert.deepEqual(area, {
    municipality: 'College Park',
    municipalityKind: 'city',
    incorporation: 'incorporated',
    county: "Prince George's County",
    state: 'Maryland',
  });
});

test('a town keeps its type word so it is never called a city', () => {
  const area = parseCensus(
    answer({
      States: [state],
      'County Subdivisions': [marylandDistrict],
      'Incorporated Places': [{ NAME: 'University Park town', BASENAME: 'University Park', FUNCSTAT: 'A', LSADC: '43' }],
      Counties: [county],
    }),
  );
  assert.equal(area?.municipality, 'University Park');
  assert.equal(area?.municipalityKind, 'town');
  assert.equal(area?.incorporation, 'incorporated');
});

const greenwich = answer({
  States: [{ NAME: 'Connecticut', BASENAME: 'Connecticut', FUNCSTAT: 'A' }],
  'County Subdivisions': [{ NAME: 'Greenwich town', BASENAME: 'Greenwich', FUNCSTAT: 'A', LSADC: '43' }],
  'Census Designated Places': [{ NAME: 'Greenwich CDP', BASENAME: 'Greenwich', FUNCSTAT: 'S', LSADC: '57' }],
  Counties: [{ NAME: 'Western Connecticut Planning Region', BASENAME: 'Western Connecticut', FUNCSTAT: 'N', LSADC: 'PL' }],
});

test('an active New England town is the local government, and a planning region is not a county', () => {
  assert.deepEqual(parseCensus(greenwich), {
    municipality: 'Greenwich',
    municipalityKind: 'town',
    incorporation: 'incorporated',
    county: null,
    state: 'Connecticut',
  });
});

test('a county equivalent run by a city government is kept', () => {
  const area = parseCensus(
    answer({
      States: [state],
      'Incorporated Places': [{ NAME: 'Baltimore city', BASENAME: 'Baltimore', FUNCSTAT: 'A' }],
      Counties: [{ NAME: 'Baltimore city', BASENAME: 'Baltimore', FUNCSTAT: 'F' }],
    }),
  );
  assert.equal(area?.county, 'Baltimore city');
  assert.equal(area?.municipalityKind, 'city');
});

test('an incorporated place wins over the town around it', () => {
  const area = parseCensus(
    answer({
      States: [{ NAME: 'New York', BASENAME: 'New York', FUNCSTAT: 'A' }],
      'County Subdivisions': [{ NAME: 'Mamaroneck town', BASENAME: 'Mamaroneck', FUNCSTAT: 'A' }],
      'Incorporated Places': [{ NAME: 'Larchmont village', BASENAME: 'Larchmont', FUNCSTAT: 'A' }],
      Counties: [{ NAME: 'Westchester County', BASENAME: 'Westchester', FUNCSTAT: 'A' }],
    }),
  );
  assert.equal(area?.municipality, 'Larchmont');
  assert.equal(area?.municipalityKind, 'village');
});

test('a county with no incorporated place and no active town is unincorporated', () => {
  const area = parseCensus(answer({ 'Incorporated Places': [], 'County Subdivisions': [marylandDistrict], Counties: [county], States: [state] }));
  assert.deepEqual(area, {
    municipality: null,
    municipalityKind: null,
    incorporation: 'unincorporated',
    county: "Prince George's County",
    state: 'Maryland',
  });
});

test('a Census Designated Place is not a municipality', () => {
  const area = parseCensus(
    answer({
      'Incorporated Places': [],
      'Census Designated Places': [{ NAME: 'Adelphi CDP', BASENAME: 'Adelphi', FUNCSTAT: 'S' }],
      Counties: [county],
      States: [state],
    }),
  );
  assert.equal(area?.incorporation, 'unincorporated');
  assert.equal(area?.municipality, null);
});

test('an inactive incorporated place has no government to report to', () => {
  const area = parseCensus(
    answer({ 'Incorporated Places': [{ NAME: 'Ghost town', BASENAME: 'Ghost', FUNCSTAT: 'I' }], Counties: [county], States: [state] }),
  );
  assert.equal(area?.incorporation, 'unincorporated');
});

test('an empty answer (outside the U.S.) means Census does not know', () => {
  assert.equal(parseCensus(answer({})), null);
  assert.equal(parseCensus(answer({ States: [], Counties: [], 'Incorporated Places': [] })), null);
});

test('an unexpected body is a provider failure, not "unincorporated"', () => {
  assert.throws(() => parseCensus({ errors: ['Invalid benchmark'] }));
  assert.throws(() => parseCensus(null));
});
