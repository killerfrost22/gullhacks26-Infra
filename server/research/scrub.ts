import { EMAIL_PATTERN, PHONE_PATTERN, phoneDigits } from './provenance.js';

/** Contact details and links the server verified on loaded pages. Only these may appear in model-written text. */
export interface VerifiedValues {
  email: string | null;
  phone: string | null;
  /** Loaded pages kept for this report (sources, evidence, reporting page). */
  urls: string[];
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`)\]]{1,2000}/gi;
const BARE_HOST_PATTERN = /\b(?:[a-z0-9-]{1,63}\.){1,8}(?:gov|mil|edu|com|org|net|us|info|io|co|uk|ca)\b(?:\/[^\s<>"'`)\]]{0,500})?/gi;
const SHORT_CODE_PATTERN = /\b[2-9]11\b/g;

const bareHost = (value: string) => value.toLowerCase().split('/')[0].replace(/^www\./, '').replace(/\.$/, '');
const trimUrl = (value: string) => value.replace(/[.,;:!?]+$/, '');

function sentenceIsClean(sentence: string, allowed: VerifiedValues, allowedUrls: Set<string>, allowedHosts: Set<string>): boolean {
  let rest = sentence;
  for (const match of sentence.matchAll(EMAIL_PATTERN)) {
    if (match[0].toLowerCase() !== allowed.email) return false;
    rest = rest.replace(match[0], ' ');
  }
  for (const match of rest.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0]);
    if (!allowedUrls.has(url.replace(/\/$/, ''))) return false;
    rest = rest.replace(match[0], ' ');
  }
  for (const match of rest.matchAll(BARE_HOST_PATTERN)) {
    if (!allowedHosts.has(bareHost(match[0]))) return false;
  }
  const verifiedDigits = allowed.phone ? phoneDigits(allowed.phone) : null;
  for (const match of rest.matchAll(PHONE_PATTERN)) {
    const digits = phoneDigits(match[0]);
    if (digits.length >= 7 && digits !== verifiedDigits) return false;
  }
  for (const match of rest.matchAll(SHORT_CODE_PATTERN)) if (match[0] !== verifiedDigits) return false;
  return true;
}

const PHOTO_WORDS = /\b(?:photos?|photographs?|pictures?|pictured|images?|snapshots?)\b/i;

/**
 * Removes every sentence of model-written text that carries an email address, phone number, or link the server
 * didn't verify, and, for a report without a photo, any sentence that talks about a photo. Returns null when nothing
 * usable is left, so the caller can fall back to neutral wording.
 */
export function scrubFreeText(text: string, allowed: VerifiedValues, options: { allowPhotoMentions: boolean }): string | null {
  const allowedUrls = new Set(allowed.urls.map((url) => url.replace(/\/$/, '')));
  const allowedHosts = new Set(
    allowed.urls.flatMap((url) => {
      try {
        return [bareHost(new URL(url).hostname)];
      } catch {
        return [];
      }
    }),
  );
  const kept = text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => options.allowPhotoMentions || !PHOTO_WORDS.test(sentence))
    .filter((sentence) => sentenceIsClean(sentence, allowed, allowedUrls, allowedHosts))
    .join(' ')
    .trim();
  return /[a-z].*[a-z]/i.test(kept) ? kept : null;
}
