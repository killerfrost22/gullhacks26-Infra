import type { Investigation, IssueKind, Place } from '../../shared/types';
import { describePlace, stripCoordinates } from './place';

export interface EmailDraft {
  /** A published, verified address, or `''` so the user fills it in. */
  to: string;
  subject: string;
  /** Lines separated by `\n`. */
  body: string;
}

const KIND_TITLES: Record<IssueKind, string> = {
  pothole: 'Pothole',
  road_damage: 'Road damage',
  streetlight: 'Street light problem',
  traffic_signal: 'Traffic signal problem',
  sign: 'Damaged sign',
  sidewalk: 'Sidewalk damage',
  drainage: 'Drainage problem',
  graffiti: 'Graffiti',
  litter: 'Litter',
  tree: 'Tree problem',
  utility: 'Utility problem',
  other: 'Problem',
};

const EMAIL_PATTERN = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

/** The email the user sends themselves. Only facts from the report and the pin; nothing made up. */
export function createEmailDraft(input: {
  report: Investigation;
  place: Place;
  details: string;
  /** `null` when the report has no photo; the email then never mentions one. */
  photoFileName: string | null;
}): EmailDraft {
  const { report, place, details, photoFileName } = input;
  const { issue, responsibility } = report;
  const published = responsibility.email?.value.trim() ?? '';
  const to = EMAIL_PATTERN.test(published) ? published : '';

  const title = stripCoordinates(oneLine(issue.title)) || KIND_TITLES[issue.kind];
  const where = describePlace(place, report.context);
  const recipient = responsibility.department?.trim() || responsibility.organization?.trim();
  const summary = stripCoordinates(issue.summary.trim());
  const note = details.trim();

  const lines = [recipient ? `Hello ${oneLine(recipient)},` : 'Hello,', ''];
  lines.push(`I'm writing to report a problem that needs repair: ${title.replace(/[.!?]+$/, '')}.`);
  if (summary) lines.push('', summary);
  lines.push('');
  if (where) lines.push(`Location: ${where}`);
  if (note) lines.push(`${where ? 'More detail' : 'Location and detail'}: ${note}`);
  if (where || note) lines.push('');
  if (photoFileName) lines.push(`I've attached a photo (${photoFileName}).`, '');
  lines.push('Could you please arrange a repair, or let me know if this should go to a different office?', '');
  lines.push('Thank you,');

  return {
    to,
    subject: oneLine(where ? `${title} near ${where}` : title),
    body: lines.join('\n'),
  };
}

export function buildMailto(draft: EmailDraft): string {
  // `@` stays literal: some mail apps don't decode %40 in the address.
  const to = encodeURIComponent(draft.to).replace(/%40/g, '@');
  const body = draft.body.replace(/\r?\n/g, '\r\n');
  return `mailto:${to}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(body)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let base64 = '';
  // Chunks are a multiple of 3 bytes so each piece encodes without padding in the middle.
  for (let offset = 0; offset < bytes.length; offset += 0x6000) {
    base64 += btoa(String.fromCharCode(...bytes.subarray(offset, offset + 0x6000)));
  }
  return base64;
}

const wrap76 = (base64: string) => base64.match(/.{1,76}/g)?.join('\r\n') ?? '';

/** RFC 2047 encoded-words, each within the 75-character limit, split on whole characters. */
function encodeHeader(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const encoder = new TextEncoder();
  const words: string[] = [];
  let chunk = '';
  for (const char of text) {
    // 45 bytes → 60 base64 characters, plus 12 for `=?UTF-8?B??=`.
    if (encoder.encode(chunk + char).length > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += char;
  }
  if (chunk) words.push(chunk);
  return words.map((word) => `=?UTF-8?B?${bytesToBase64(encoder.encode(word))}?=`).join('\r\n ');
}

/**
 * A draft email file, with the photo attached when there is one. Mail apps open it as an unsent
 * message (`X-Unsent: 1`). Without a photo it is a single text/plain part.
 */
export async function buildEmlFile(draft: EmailDraft, photo: { blob: Blob; fileName: string } | null): Promise<File> {
  const textBytes = new TextEncoder().encode(draft.body.replace(/\r?\n/g, '\r\n'));
  const headers = [
    ...(draft.to ? [`To: ${oneLine(draft.to)}`] : []),
    `Subject: ${encodeHeader(oneLine(draft.subject))}`,
    'X-Unsent: 1',
    'MIME-Version: 1.0',
  ];
  const textPart = ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(bytesToBase64(textBytes))];
  let message: string[];
  if (photo) {
    const boundary = `fixplease-${crypto.randomUUID()}`;
    const fileName = photo.fileName.replace(/[^\w.-]/g, '_') || 'photo.jpg';
    const photoBytes = new Uint8Array(await photo.blob.arrayBuffer());
    message = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      ...textPart,
      `--${boundary}`,
      `Content-Type: image/jpeg; name="${fileName}"`,
      `Content-Disposition: attachment; filename="${fileName}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(bytesToBase64(photoBytes)),
      `--${boundary}--`,
      '',
    ];
  } else {
    message = [...headers, ...textPart, ''];
  }
  return new File([message.join('\r\n')], 'fixplease-report.eml', { type: 'message/rfc822' });
}
