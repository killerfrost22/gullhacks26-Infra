import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmailFile, buildMailto, createEmailDraft } from './email';
import type { Investigation, PreparedPhoto } from '../../shared/types';

const photo: PreparedPhoto = {
  dataUrl: 'data:image/jpeg;base64,/9j/2Q==',
  fileName: 'report-photo.jpg', width: 1, height: 1, gps: null,
};

const report: Investigation = {
  id: 'routing-unresolved', createdAt: '2026-10-20T12:00:00Z',
  timings: { contextMs: 0, researchMs: 1800, formattingMs: 600, verificationMs: 100, totalMs: 2500 },
  issue: { type: 'pothole', title: 'Road damage', summary: 'A depression in the road.', observations: ['Uneven road surface'] },
  location: { latitude: 0, longitude: 0, label: 'User-confirmed coordinates', address: null },
  context: null,
  responsibility: {
    status: 'unresolved', organization: null, department: null, email: null,
    emailSourceUrl: null, phone: null, reportingUrl: null, reason: 'No asset owner confirmed.',
  },
  sources: [], warnings: ['Ownership requires confirmation.'],
  searchSuggestionsHtml: [],
};

test('email MIME preserves Unicode text and exact photo bytes without unsafe headers', () => {
  const draft = { to: 'maintenance@example.edu', subject: 'Éclairage près de l’université 大学 💡\r\nBcc: attacker@example.com', body: 'Une lumière est éteinte.\n位置：大学。\nThanks 💡' };
  const file = buildEmailFile(draft, photo, new Date('2026-10-20T12:00:00Z'));
  const headers = file.split('\r\n\r\n')[0];
  assert.equal(/^Bcc:/m.test(headers), false);
  const subject = headers.match(/^Subject: ([\s\S]*?)(?=\r\nMIME-Version:)/m)?.[1];
  assert.ok(subject);
  const decodedSubject = [...subject.matchAll(/=\?UTF-8\?B\?([^?]*)\?=/g)].map((match) => Buffer.from(match[1], 'base64').toString('utf8')).join('');
  assert.equal(decodedSubject, draft.subject.replace(/[\r\n]+/g, ' '));
  for (const word of subject.split(/\r\n /)) assert.ok(word.length <= 75);
  const textPart = file.match(/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)?.[1];
  assert.ok(textPart);
  assert.equal(Buffer.from(textPart, 'base64').toString('utf8'), draft.body.replace(/\n/g, '\r\n'));
  const imagePart = file.match(/Content-Disposition: attachment; filename="report-photo.jpg"\r\n\r\n([\s\S]*?)\r\n--/)?.[1];
  assert.ok(imagePart);
  assert.deepEqual(Buffer.from(imagePart, 'base64'), Buffer.from('/9j/2Q==', 'base64'));
});

test('a contact without a supporting source is never preaddressed', () => {
  const ungrounded = { ...report, responsibility: { ...report.responsibility, email: 'guessed@example.edu' } };
  const draft = createEmailDraft(ungrounded, '');
  assert.equal(draft.to, '');
  assert.equal(/^To:/m.test(buildEmailFile(draft, photo)), false);
});

test('recipient header injection is rejected in both draft export paths', () => {
  const draft = { to: 'office@example.edu\r\nBcc: attacker@example.com', subject: 'Road report', body: 'Please inspect.' };
  assert.throws(() => buildEmailFile(draft, photo), /recipient email/);
  assert.throws(() => buildMailto(draft), /recipient email/);
});

test('subjects contain only the issue, street, and city rather than the geocoder hierarchy', () => {
  const location = {
    ...report.location,
    label: 'Engineering Building, 15, College Avenue, Downtown, Davis, Yolo County, California, 95616, United States',
    address: { street: 'College Avenue', city: 'Davis', houseNumber: '15' },
  };
  const cases: { type: Investigation['issue']['type']; title: string; subject: string }[] = [
    { type: 'pothole', title: 'Road surface disintegration exposing loose base aggregate', subject: 'Pothole' },
    { type: 'light_outage', title: 'Reported streetlight malfunction on campus', subject: 'Light outage' },
    { type: 'other', title: 'Open utility box', subject: 'Open utility box' },
  ];
  for (const item of cases) {
    const draft = createEmailDraft({ ...report, location, issue: { ...report.issue, type: item.type, title: item.title } }, '');
    assert.equal(draft.subject, `${item.subject} — College Avenue, Davis`);
  }
});

test('the body carries the issue, address, and photo reference, but no raw GPS or research feedback clues', () => {
  const detailed: Investigation = {
    ...report,
    issue: {
      type: 'other', title: 'Open utility box',
      summary: 'An uncovered utility box in the grass has exposed components.',
      observations: ['Separate investigation observation that should stay on the website.'],
    },
    location: {
      latitude: 38.5449, longitude: -121.7405,
      label: 'Engineering Building, 15 College Avenue, Downtown, Davis, Yolo County, California, 95616, United States',
      address: { street: 'College Avenue', city: 'Davis', houseNumber: '15' },
    },
    responsibility: {
      ...report.responsibility,
      status: 'source_supported', organization: 'Campus Facilities', department: 'Asset Ownership Team',
      email: 'maintenance@example.edu', emailSourceUrl: 'https://example.edu/facilities/contact',
      phone: '+1 555 0100', reportingUrl: 'https://example.edu/report',
      reason: 'Internal routing explanation: inspect the lot boundaries before assigning a repair team.',
    },
    sources: [{ title: 'Official facilities directory', url: 'https://example.edu/directory', note: 'Internal source-verification evidence.' }],
    warnings: ['The open ground box creates a direct tripping hazard.', 'Exact ownership depends on property lot lines.'],
  };
  const words = 'I think Greenbelt Station HOA handles this repair.';
  const draft = createEmailDraft(detailed, `  ${words}\n`);
  assert.equal(draft.to, 'maintenance@example.edu');
  assert.ok(draft.body.includes(detailed.issue.summary));
  assert.ok(draft.body.includes('15 College Avenue, Davis'));
  assert.equal(draft.body.includes(words), false, 'User research feedback/clues should not be in the email body');
  assert.equal(draft.body.includes('38.54490'), false, 'GPS coordinates should not be in the email body');
  assert.match(draft.body, /photo.*attached/i);
  assert.doesNotMatch(draft.body, /https?:\/\//i);
  for (const internalValue of [
    detailed.responsibility.organization!, detailed.responsibility.department!, detailed.responsibility.reason,
    detailed.sources[0].title, detailed.sources[0].note, detailed.issue.observations[0],
    ...detailed.warnings, 'Yolo County', '95616',
  ]) assert.equal(draft.body.includes(internalValue), false, `Unexpected email content: ${internalValue}`);
});

test('missing address components do not turn a location label into invented street or city names', () => {
  const unknown = { ...report, location: { ...report.location, label: 'Confirmed map point near the east entrance', address: null } };
  const draft = createEmailDraft(unknown, '');
  assert.equal(draft.subject, 'Pothole');
  assert.ok(draft.body.includes(unknown.location.label));
});

test('a known city without a street keeps the specific campus location in the body', () => {
  const campus = {
    ...report,
    issue: { ...report.issue, type: 'other' as const, title: 'Open utility box' },
    location: {
      ...report.location,
      label: 'North Quad, Example College, Davis',
      address: { street: null, city: 'Davis', houseNumber: null },
    },
  };
  const draft = createEmailDraft(campus, '');
  assert.equal(draft.subject, 'Open utility box — Davis');
  assert.ok(draft.body.includes(campus.location.label));
});

test('coordinate strings in location label are never printed in the email draft', () => {
  const coordReport: Investigation = {
    ...report,
    location: {
      latitude: 39.006123,
      longitude: -76.901234,
      label: 'Coordinates: 39.006123, -76.901234',
      address: null,
    },
  };
  const draft = createEmailDraft(coordReport);
  assert.equal(draft.body.includes('Coordinates:'), false);
  assert.equal(draft.body.includes('39.006123'), false);
  assert.equal(draft.body.includes('-76.901234'), false);
  assert.equal(draft.body.includes('at Coordinates'), false);
});
