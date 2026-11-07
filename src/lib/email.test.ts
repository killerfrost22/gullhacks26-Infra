import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Investigation, LocationContext, Place } from '../../shared/types';
import { buildEmlFile, buildMailto, createEmailDraft } from './email';

function makeReport(overrides: Partial<Investigation['responsibility']> = {}, context: LocationContext | null = null): Investigation {
  return {
    issue: {
      kind: 'pothole',
      title: 'Pothole in the eastbound lane',
      summary: 'A pothole about 40 cm wide sits in the right wheel path.',
      observations: [],
    },
    responsibility: {
      verdict: 'confirmed',
      organization: "Prince George's County",
      department: 'Department of Public Works and Transportation',
      reason: 'The county maintains this road.',
      evidence: { url: 'https://www.princegeorgescountymd.gov/roads', quote: 'County roads' },
      reportingUrl: null,
      email: { value: 'roads@co.pg.md.us', sourceUrl: 'https://www.princegeorgescountymd.gov/roads' },
      phone: null,
      ...overrides,
    },
    sources: [],
    warnings: [],
    searchSuggestionsHtml: null,
    context,
    generatedAt: '2026-11-07T20:00:00.000Z',
  };
}

const campusPlace: Place = {
  latitude: 38.98972,
  longitude: -76.93776,
  label: '4306, Campus Drive, College Park, Maryland, 20742, United States',
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
};

const coordinatePattern = /\d{1,3}\.\d{3,}/;

describe('createEmailDraft', () => {
  test('writes the subject from the issue title and short place', () => {
    const draft = createEmailDraft({ report: makeReport(), place: campusPlace, details: '', photoFileName: 'fixplease-20261107-1532.jpg' });
    assert.equal(draft.subject, 'Pothole in the eastbound lane near 4306 Campus Drive, College Park');
    assert.equal(draft.to, 'roads@co.pg.md.us');
    assert.match(draft.body, /^Hello Department of Public Works and Transportation,\n/);
    assert.match(draft.body, /Location: 4306 Campus Drive, College Park/);
    assert.match(draft.body, /fixplease-20261107-1532\.jpg/);
    assert.match(draft.body, /Thank you,$/);
  });

  test('never includes coordinates, even when the label is made of them', () => {
    const place: Place = { latitude: 38.98972, longitude: -76.93776, label: '38.98972, -76.93776', address: null };
    const draft = createEmailDraft({ report: makeReport(), place, details: 'By the bus stop', photoFileName: 'p.jpg' });
    assert.doesNotMatch(draft.subject, coordinatePattern);
    assert.doesNotMatch(draft.body, coordinatePattern);
    assert.equal(draft.subject, 'Pothole in the eastbound lane');
    assert.match(draft.body, /By the bus stop/);
  });

  test('keeps the street from a label that mixes in coordinates', () => {
    const place: Place = { latitude: 1, longitude: 2, label: 'Baltimore Avenue (38.9897, -76.9378)', address: null };
    const draft = createEmailDraft({ report: makeReport(), place, details: '', photoFileName: 'p.jpg' });
    assert.equal(draft.subject, 'Pothole in the eastbound lane near Baltimore Avenue');
    assert.doesNotMatch(draft.body, coordinatePattern);
  });

  test('missing address parts do not become invented names', () => {
    const place: Place = {
      latitude: 1,
      longitude: 2,
      label: 'Somewhere',
      address: { houseNumber: '12', road: null, locality: null, county: null, state: 'Maryland', postcode: null, country: null, countryCode: 'us' },
    };
    const report = makeReport({ verdict: 'unidentified', organization: null, department: null, evidence: null, email: null });
    const draft = createEmailDraft({ report, place, details: '', photoFileName: 'p.jpg' });
    assert.equal(draft.to, '');
    assert.match(draft.body, /^Hello,\n/);
    assert.doesNotMatch(draft.body, /City of|Public Works|undefined|null/);
    // The house number alone isn't an address; Maryland alone isn't a location line.
    assert.doesNotMatch(draft.body, /\b12\b/);
    assert.equal(draft.subject, 'Pothole in the eastbound lane near Somewhere');
  });

  test('To stays empty without a verified email', () => {
    const draft = createEmailDraft({ report: makeReport({ email: null }), place: campusPlace, details: '', photoFileName: 'p.jpg' });
    assert.equal(draft.to, '');
  });

  test('a malformed published address is not used as a recipient', () => {
    const email = { value: 'roads@city.gov\r\nBcc: x@evil.invalid', sourceUrl: 'https://city.gov' };
    const draft = createEmailDraft({ report: makeReport({ email }), place: campusPlace, details: '', photoFileName: 'p.jpg' });
    assert.equal(draft.to, '');
  });

  test('greets the organization when no department is known', () => {
    const report = makeReport({ verdict: 'best_match', department: null, organization: 'City of College Park' });
    const draft = createEmailDraft({ report, place: campusPlace, details: '', photoFileName: 'p.jpg' });
    assert.match(draft.body, /^Hello City of College Park,\n/);
  });

  test('leaves out research internals', () => {
    const draft = createEmailDraft({ report: makeReport(), place: campusPlace, details: 'Near the stop sign', photoFileName: 'p.jpg' });
    assert.doesNotMatch(`${draft.subject}\n${draft.body}`, /map facts|gemini|confirmed|best match|unidentified|verdict/i);
  });

  test('falls back to campus from map facts when the address has no road', () => {
    const context: LocationContext = {
      road: null,
      campus: { name: 'University of Maryland', operator: null, website: null },
      streetLights: [],
      area: null,
      partial: false,
    };
    const place: Place = { latitude: 1, longitude: 2, label: 'x', address: { ...campusPlace.address!, houseNumber: null, road: null } };
    const draft = createEmailDraft({ report: makeReport({}, context), place, details: '', photoFileName: 'p.jpg' });
    assert.equal(draft.subject, 'Pothole in the eastbound lane near University of Maryland, College Park');
  });

  test('the municipality from map facts appears without a type word', () => {
    const context: LocationContext = {
      road: null,
      campus: null,
      streetLights: [],
      area: {
        municipality: 'University Park',
        municipalityKind: 'town',
        incorporation: 'incorporated',
        county: "Prince George's County",
        state: 'Maryland',
        country: 'United States',
        countryCode: 'us',
      },
      partial: false,
    };
    const place: Place = { latitude: 1, longitude: 2, label: 'x', address: { ...campusPlace.address!, houseNumber: '7', road: 'Pineway', locality: null } };
    const report = makeReport({ verdict: 'unidentified', organization: null, department: null, evidence: null, email: null }, context);
    const draft = createEmailDraft({ report, place, details: '', photoFileName: 'p.jpg' });
    assert.equal(draft.subject, 'Pothole in the eastbound lane near 7 Pineway, University Park');
    assert.doesNotMatch(`${draft.subject}\n${draft.body}`, /\b(City|Town|Village|Borough|Township) of\b/);
  });
});

describe('buildMailto', () => {
  test('percent-encodes subject and body with CRLF line breaks', () => {
    const url = buildMailto({ to: 'roads@city.gov', subject: 'Pothole & sign near 1st Ave', body: 'Hello,\n\nThanks?' });
    assert.equal(url, 'mailto:roads@city.gov?subject=Pothole%20%26%20sign%20near%201st%20Ave&body=Hello%2C%0D%0A%0D%0AThanks%3F');
  });

  test('works with an empty recipient', () => {
    assert.match(buildMailto({ to: '', subject: 'S', body: 'B' }), /^mailto:\?subject=S&body=B$/);
  });
});

describe('buildEmlFile', () => {
  test('builds a MIME draft whose attachment round-trips', async () => {
    const photoBytes = new Uint8Array(5000).map((_, i) => (i * 37) % 256);
    const draft = { to: 'roads@city.gov', subject: 'Pothole near Café Street', body: 'Hello,\n\nLine two\nThank you,' };
    const file = await buildEmlFile(draft, { blob: new Blob([photoBytes], { type: 'image/jpeg' }), fileName: 'fixplease-20261107-1532.jpg' });

    assert.equal(file.name, 'fixplease-report.eml');
    assert.equal(file.type, 'message/rfc822');
    const text = await file.text();
    assert.doesNotMatch(text.replace(/\r\n/g, ''), /[\r\n]/, 'every line ends in CRLF');

    const [head, ...rest] = text.split('\r\n\r\n');
    assert.match(head, /^To: roads@city\.gov$/m);
    assert.match(head, /^X-Unsent: 1$/m);
    assert.match(head, /^MIME-Version: 1\.0$/m);
    const subject = /^Subject: (=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=)$/m.exec(head);
    assert.ok(subject, 'non-ASCII subject is RFC 2047 encoded');
    assert.equal(Buffer.from(subject[2], 'base64').toString('utf8'), 'Pothole near Café Street');
    const boundary = /boundary="([^"]+)"/.exec(head)?.[1];
    assert.ok(boundary);
    const body = rest.join('\r\n\r\n');
    assert.ok(body.trimEnd().endsWith(`--${boundary}--`));

    const parts = body.split(`--${boundary}`).slice(1, -1);
    assert.equal(parts.length, 2);
    const [textPart, imagePart] = parts.map((part) => {
      const [partHead, partBody] = part.replace(/^\r\n/, '').split('\r\n\r\n');
      return { head: partHead, lines: partBody.trim().split('\r\n') };
    });
    assert.match(textPart.head, /text\/plain; charset=UTF-8/);
    assert.equal(Buffer.from(textPart.lines.join(''), 'base64').toString('utf8'), 'Hello,\r\n\r\nLine two\r\nThank you,');
    assert.match(imagePart.head, /Content-Type: image\/jpeg; name="fixplease-20261107-1532\.jpg"/);
    assert.match(imagePart.head, /Content-Disposition: attachment; filename="fixplease-20261107-1532\.jpg"/);
    assert.ok(imagePart.lines.every((line) => line.length <= 76));
    assert.deepEqual(new Uint8Array(Buffer.from(imagePart.lines.join(''), 'base64')), photoBytes);
  });

  test('leaves out To when there is no recipient and keeps ASCII subjects plain', async () => {
    const file = await buildEmlFile({ to: '', subject: 'Pothole', body: 'Hi' }, { blob: new Blob([new Uint8Array([1, 2, 3])]), fileName: 'p.jpg' });
    const head = (await file.text()).split('\r\n\r\n')[0];
    assert.doesNotMatch(head, /^To:/m);
    assert.match(head, /^Subject: Pothole$/m);
  });

  test('splits long non-ASCII subjects into short encoded words', async () => {
    const subject = 'Bache en el carril en dirección este cerca de la Avenida Ñandú número 4306';
    const file = await buildEmlFile({ to: '', subject, body: 'Hi' }, { blob: new Blob([]), fileName: 'p.jpg' });
    const head = (await file.text()).split('\r\n\r\n')[0];
    const words = [...head.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
    assert.ok(words.length > 1);
    assert.ok(words.every((word) => word[0].length <= 75));
    assert.equal(words.map((word) => Buffer.from(word[1], 'base64').toString('utf8')).join(''), subject);
  });
});
