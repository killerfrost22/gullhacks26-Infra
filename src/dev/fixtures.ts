// Dev-only fixtures for the `?scene=` harness. Organizations, addresses, and URLs are made up for
// layout review (example.org hosts), except the Google search-suggestions markup, which is a real
// capture from a live report so its layout quirks show up here. None of it ships in production.
import type { Investigation, LocationContext, Place } from '../../shared/types';
import type { PreparedPhoto } from '../lib/photo';
import LIVE_SUGGESTIONS_HTML from './search-suggestions-live.html?raw';

/** Draws a fake pothole photo so scenes need no image files. */
export async function fixturePhoto(withGps: boolean): Promise<PreparedPhoto> {
  const width = 1200;
  const height = 900;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4a4d50';
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 9000; i += 1) {
    const shade = 50 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgb(${shade} ${shade} ${shade + 4})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 3, 3);
  }
  ctx.fillStyle = '#f2c230';
  for (let y = 0; y < height; y += 160) ctx.fillRect(140, y, 26, 100);
  ctx.beginPath();
  ctx.ellipse(680, 520, 260, 150, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = '#1d1e1f';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(660, 500, 200, 105, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = '#2a2826';
  ctx.fill();
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8));
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.8),
    blob,
    width,
    height,
    fileName: 'pothole.jpg',
    gps: withGps ? { latitude: 38.98582, longitude: -76.94446 } : null,
  };
}

export const PLACE: Place = {
  latitude: 38.98582,
  longitude: -76.94446,
  label: '4300 Campus Drive, College Park, Maryland',
  address: {
    houseNumber: '4300',
    road: 'Campus Drive',
    locality: 'College Park',
    county: 'Prince George’s County',
    state: 'Maryland',
    postcode: '20742',
    country: 'United States',
    countryCode: 'us',
  },
};

export const SEARCH_RESULTS: Place[] = [
  PLACE,
  { ...PLACE, latitude: 38.99, longitude: -76.93, label: 'Campus Drive, Hyattsville, Maryland' },
  { ...PLACE, latitude: 39.1, longitude: -76.8, label: 'Campus Drive, Laurel, Maryland' },
];

export const CONTEXT: LocationContext = {
  road: { name: 'Campus Drive', ref: 'MD 193', kind: 'secondary', operator: null, distanceMeters: 6 },
  campus: { name: 'Example State University', operator: null, website: 'https://campus.example.org' },
  streetLights: [{ operator: 'Example Power Co.', ref: 'P-10442', distanceMeters: 14 }],
  area: {
    municipality: 'College Park',
    municipalityKind: 'city',
    incorporation: 'incorporated',
    county: 'Prince George’s County',
    state: 'Maryland',
    country: 'United States',
    countryCode: 'us',
  },
  partial: false,
};

/** A pin inside a town, so the review shows "Town of …"; Overpass was "down", so the facts are partial. */
export const CONTEXT_TOWN: LocationContext = {
  road: { name: 'Queens Chapel Road', ref: 'MD 500', kind: 'primary', operator: null, distanceMeters: 9 },
  campus: null,
  streetLights: [],
  area: {
    municipality: 'University Park',
    municipalityKind: 'town',
    incorporation: 'incorporated',
    county: 'Prince George’s County',
    state: 'Maryland',
    country: 'United States',
    countryCode: 'us',
  },
  partial: true,
};

const BASE: Investigation = {
  issue: {
    kind: 'pothole',
    title: 'Pothole in the eastbound lane',
    summary: 'A wide pothole, roughly a metre across, in the eastbound travel lane next to the lane line.',
    observations: ['Broken edges', 'Standing water nearby'],
  },
  responsibility: {
    verdict: 'confirmed',
    organization: 'Example State Highway Administration',
    department: 'District 3 Maintenance',
    reason:
      'Campus Drive here is MD 193, a numbered state route. The state highway agency’s maintenance page says it repairs potholes on numbered state routes in this county.',
    evidence: {
      url: 'https://roads.example.org/maintenance/district-3',
      quote: 'District 3 maintains all numbered state routes in Prince George’s and Montgomery counties.',
    },
    reportingUrl: 'https://roads.example.org/report',
    email: { value: 'district3-maintenance@roads.example.org', sourceUrl: 'https://roads.example.org/contact' },
    phone: { value: '(555) 010-0193', sourceUrl: 'https://roads.example.org/contact' },
  },
  sources: [
    {
      title: 'District 3 maintenance',
      url: 'https://roads.example.org/maintenance/district-3',
      note: 'Says which roads the district covers.',
      official: true,
    },
    { title: 'Contact the district office', url: 'https://roads.example.org/contact', note: null, official: true },
    {
      title: 'Report a road problem',
      url: 'https://roads.example.org/report',
      note: 'Online form for potholes and road damage.',
      official: true,
    },
  ],
  warnings: [
    'If the pothole is deep enough to damage a car or is in a busy lane, mention that so they can prioritise it.',
  ],
  searchSuggestionsHtml: LIVE_SUGGESTIONS_HTML,
  context: CONTEXT,
  generatedAt: '2026-11-07T21:00:00.000Z',
};

export const REPORT_CONFIRMED: Investigation = BASE;

export const REPORT_BEST_MATCH: Investigation = {
  ...BASE,
  responsibility: {
    ...BASE.responsibility,
    verdict: 'best_match',
    organization: 'City of College Park Public Works',
    department: null,
    reason:
      'The pin is inside College Park city limits, and the city’s public works page covers street repairs. We couldn’t find a page that names this exact street.',
    evidence: null,
    email: null,
    phone: { value: '(555) 010-0742', sourceUrl: 'https://city.example.org/public-works' },
  },
  sources: [
    { title: 'Public Works', url: 'https://city.example.org/public-works', note: null, official: true },
    { title: 'Street repairs FAQ', url: 'https://city.example.org/faq', note: 'Lists what the city fixes.', official: true },
  ],
  warnings: [
    'This road may be a state route. If the city says it isn’t theirs, ask which agency maintains it.',
    'No email is published for this office. Use their report form, or call.',
  ],
};

export const REPORT_UNIDENTIFIED: Investigation = {
  ...BASE,
  responsibility: {
    verdict: 'unidentified',
    organization: null,
    department: null,
    reason: 'No official page we could load says who maintains this spot.',
    evidence: null,
    reportingUrl: null,
    email: null,
    phone: null,
  },
  sources: [],
  warnings: ['Ask the city or county which office maintains this road before you send.'],
  searchSuggestionsHtml: null,
};
