import type { Investigation, PreparedPhoto } from '../../shared/types';
import { shortPlace } from './place';

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
}

export function isSafeEmail(value: string): boolean {
  return /^[^\s@<>:,;\r\n]+@[^\s@<>:,;\r\n]+\.[^\s@<>:,;\r\n]+$/.test(value);
}

/** The email a resident would write: clear issue, location, and the attached photo. No raw GPS coordinates or AI search clues. */
export function createEmailDraft(report: Investigation, _details?: string): EmailDraft {
  const { responsibility: office, location, issue, context } = report;
  const to = office.email && office.emailSourceUrl && isSafeEmail(office.email) ? office.email : '';
  const issueName = issue.type === 'pothole' ? 'Pothole' : issue.type === 'light_outage' ? 'Light outage' : issue.title;
  const address = location.address;
  const subjectLocation = address?.street && address.city
    ? `${address.street}, ${address.city}`
    : address?.street || address?.city || '';
  const place = shortPlace(location, context);
  const locationPhrase = place ? ` at ${place}` : '';
  const cleanSummary = (issue.summary || '')
    .replace(/\(?\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b\)?/g, '')
    .replace(/\bcoordinates?:\s*/gi, '')
    .trim();
  const rawBody = [
    'Hello,',
    `I would like to report a maintenance issue${locationPhrase}. ${cleanSummary}`,
    'A photo of the issue is attached for reference.',
    'Thank you,',
  ].filter(Boolean).join('\n\n');
  // Rigorous scrub: ensure absolutely no coordinates exist in the draft body
  const body = rawBody
    .replace(/\(?\b-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\b\)?/g, '')
    .replace(/\bGPS:\s*-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\b/gi, '')
    .replace(/\bCoordinates:\s*-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\b/gi, '')
    .replace(/\bat\s*\./g, '.')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { to, subject: subjectLocation ? `${issueName} — ${subjectLocation}` : issueName, body };
}

/** The prepared photo as a File, for the system share sheet. */
export function photoFile(photo: PreparedPhoto): File {
  const [, base64 = ''] = photo.dataUrl.split(',', 2);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], photo.fileName, { type: 'image/jpeg' });
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return btoa(parts.join(''));
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function encodeSubject(value: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let chunk = '';
  let size = 0;
  for (const character of value.replace(/[\r\n]+/g, ' ')) {
    const nextSize = encoder.encode(character).length;
    if (size + nextSize > 42) {
      chunks.push(chunk);
      chunk = '';
      size = 0;
    }
    chunk += character;
    size += nextSize;
  }
  chunks.push(chunk);
  return chunks.map((part) => `=?UTF-8?B?${base64Utf8(part)}?=`).join('\r\n ');
}

/** RFC 5322/MIME draft with a metadata-stripped image, not a sent message. */
export function buildEmailFile(draft: EmailDraft, photo: PreparedPhoto, date = new Date()): string {
  if (draft.to && !isSafeEmail(draft.to)) throw new Error('The recipient email is not valid.');
  const image = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo.dataUrl);
  if (!image) throw new Error('The prepared photo is not a supported image.');
  const extension = image[1] === 'jpeg' ? 'jpg' : image[1];
  const boundary = `fixplease-${crypto.randomUUID()}`;
  return [
    'X-Unsent: 1',
    `Date: ${date.toUTCString()}`,
    ...(draft.to ? [`To: ${draft.to}`] : []),
    `Subject: ${encodeSubject(draft.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(base64Utf8(draft.body.replace(/\r?\n/g, '\r\n'))),
    `--${boundary}`,
    `Content-Type: image/${image[1]}; name="report-photo.${extension}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="report-photo.${extension}"`,
    '',
    wrapBase64(image[2]),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export function buildMailto(draft: EmailDraft): string {
  if (draft.to && !isSafeEmail(draft.to)) throw new Error('The recipient email is not valid.');
  return `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}
