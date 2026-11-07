import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DETAILS_MAX_LENGTH } from '../shared/types.js';
import { ApiError } from './errors.js';
import { parseCoordinatesQuery, parseInvestigationRequest, parseSearchQuery } from './validation.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

const dataUrl = (type: string, bytes: Buffer) => `data:image/${type};base64,${bytes.toString('base64')}`;

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    photoDataUrl: dataUrl('jpeg', JPEG),
    location: {
      latitude: 38.9869,
      longitude: -76.9426,
      label: '4306 Campus Drive, College Park',
      address: {
        houseNumber: '4306',
        road: 'Campus Drive',
        locality: 'College Park',
        county: "Prince George's County",
        state: 'Maryland',
        postcode: '20742',
        country: 'United States',
        countryCode: 'us',
      },
    },
    details: 'Deep pothole in the right lane',
    ...overrides,
  };
}

function rejectsWith(fn: () => unknown, code: string) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, code);
    assert.equal(error.status, 400);
    return true;
  });
}

test('a well-formed request passes through unchanged', () => {
  const body = validBody();
  assert.deepEqual(parseInvestigationRequest(body), body);
});

test('JPEG, PNG, and WebP photos are accepted when the bytes match the declared type', () => {
  for (const [type, bytes] of [['jpeg', JPEG], ['png', PNG], ['webp', WEBP]] as const) {
    const photoDataUrl = dataUrl(type, bytes);
    assert.equal(parseInvestigationRequest(validBody({ photoDataUrl })).photoDataUrl, photoDataUrl);
  }
});

test('a photo whose bytes do not match its declared type is INVALID_PHOTO', () => {
  rejectsWith(() => parseInvestigationRequest(validBody({ photoDataUrl: dataUrl('jpeg', PNG) })), 'INVALID_PHOTO');
  rejectsWith(() => parseInvestigationRequest(validBody({ photoDataUrl: dataUrl('png', JPEG) })), 'INVALID_PHOTO');
  rejectsWith(() => parseInvestigationRequest(validBody({ photoDataUrl: dataUrl('webp', PNG) })), 'INVALID_PHOTO');
});

test('other formats, broken base64, and missing photos are INVALID_PHOTO', () => {
  for (const photoDataUrl of [
    dataUrl('gif', Buffer.from('GIF89a......')),
    dataUrl('heic', JPEG),
    `data:image/jpeg;base64,${JPEG.toString('base64')}!!`,
    `data:image/jpeg;base64,${JPEG.toString('base64').slice(0, -1)}`,
    'https://example.invalid/photo.jpg',
    '',
    undefined,
    42,
  ]) {
    rejectsWith(() => parseInvestigationRequest(validBody({ photoDataUrl })), 'INVALID_PHOTO');
  }
});

test(`details: ${DETAILS_MAX_LENGTH} characters pass, ${DETAILS_MAX_LENGTH + 1} are INVALID_REQUEST`, () => {
  const atLimit = 'x'.repeat(DETAILS_MAX_LENGTH);
  assert.equal(parseInvestigationRequest(validBody({ details: atLimit })).details, atLimit);
  rejectsWith(() => parseInvestigationRequest(validBody({ details: 'x'.repeat(DETAILS_MAX_LENGTH + 1) })), 'INVALID_REQUEST');
  rejectsWith(() => parseInvestigationRequest(validBody({ details: 12 })), 'INVALID_REQUEST');
  assert.equal(parseInvestigationRequest(validBody({ details: undefined })).details, '');
});

test('coordinates out of range, non-numbers, or a bad label are INVALID_LOCATION', () => {
  const base = validBody().location;
  for (const location of [
    { ...base, latitude: 90.0001 },
    { ...base, latitude: -91 },
    { ...base, longitude: 180.5 },
    { ...base, latitude: '38.98' },
    { ...base, label: '' },
    { ...base, label: '   ' },
    { ...base, label: 'x'.repeat(301) },
    { ...base, address: { ...base.address, road: 7 } },
    null,
    undefined,
  ]) {
    rejectsWith(() => parseInvestigationRequest(validBody({ location })), 'INVALID_LOCATION');
  }
});

test('edge coordinates, a 300-character label, and a missing address are accepted', () => {
  const base = validBody().location;
  const location = { latitude: 90, longitude: -180, label: 'x'.repeat(300), address: null };
  assert.deepEqual(parseInvestigationRequest(validBody({ location })).location, location);
  const partial = { ...base, address: { road: 'Campus Drive' } };
  assert.equal(parseInvestigationRequest(validBody({ location: partial })).location.address?.locality, null);
});

test('a body that is not an object is INVALID_REQUEST', () => {
  for (const body of [null, undefined, 'text', [], 5]) {
    rejectsWith(() => parseInvestigationRequest(body), 'INVALID_REQUEST');
  }
});

test('lat/lon query params must be finite numbers in range', () => {
  assert.deepEqual(parseCoordinatesQuery({ lat: '38.98', lon: '-76.94' }), { latitude: 38.98, longitude: -76.94 });
  assert.deepEqual(parseCoordinatesQuery({ lat: '-90', lon: '180' }), { latitude: -90, longitude: 180 });
  for (const query of [
    { lat: '90.01', lon: '0' },
    { lat: '0', lon: '-180.01' },
    { lat: '', lon: '0' },
    { lat: '1e999', lon: '0' },
    { lat: 'Infinity', lon: '0' },
    { lat: 'abc', lon: '0' },
    { lat: '0' },
    { lat: ['1', '2'], lon: '0' },
  ]) {
    rejectsWith(() => parseCoordinatesQuery(query), 'INVALID_LOCATION');
  }
});

test('search q is 2–200 characters after trimming', () => {
  assert.equal(parseSearchQuery({ q: '  College Park  ' }), 'College Park');
  assert.equal(parseSearchQuery({ q: 'ab' }), 'ab');
  assert.equal(parseSearchQuery({ q: 'x'.repeat(200) }).length, 200);
  for (const q of [' a ', '', 'x'.repeat(201), undefined, ['ab', 'cd']]) {
    rejectsWith(() => parseSearchQuery({ q }), 'INVALID_REQUEST');
  }
});
