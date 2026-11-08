import type { ApiErrorCode } from '../../shared/types';
import { ApiRequestError } from './api';
import { LocateError } from './geolocate';
import { PhotoError } from './photo';

/** What the app says for each API failure. Written to the user; never includes provider text. */
export const errorMessages: Record<ApiErrorCode | 'NETWORK_ERROR', string> = {
  INVALID_REQUEST: "Something in the report didn't look right. Check the photo, pin, and note, then try again.",
  INVALID_PHOTO: "We couldn't read that photo. Try another one, or take a new photo.",
  INVALID_LOCATION: "That pin isn't a spot we can look up. Move it and try again.",
  PAYLOAD_TOO_LARGE: 'That photo is too large to send. Try a smaller one.',
  FORBIDDEN_ORIGIN: "That request didn't come from the Fix Please page. Reload the page and try again.",
  CAPTCHA_REQUIRED: "The bot check didn't run. Reload the page and try again.",
  CAPTCHA_INVALID: "The bot check didn't go through. Try again.",
  RATE_LIMITED: "You're going a bit fast. Wait a minute and try again.",
  RESEARCH_RATE_LIMITED: "That's a lot of reports in a short time. Give it a few minutes and try again.",
  RESEARCH_UNAVAILABLE: 'Report lookup is offline right now.',
  RESEARCH_QUOTA: "We've hit our lookup limit for now. Try again later.",
  RESEARCH_FAILED: "We couldn't finish finding who fixes this. Try again.",
  GEOCODER_UNAVAILABLE: "Address lookup isn't responding right now. Tap the map to drop the pin instead.",
  NOT_FOUND: "We couldn't find that. Reload the page and try again.",
  INTERNAL_ERROR: 'Something went wrong. Try again.',
  DETAILS_REQUIRED: "Without a photo, tell us what's broken in your note.",
  NETWORK_ERROR: "We couldn't reach Fix Please. Check your connection and try again.",
};

/** The message to show for any error the lib throws, or `null` when the user cancelled. */
export function messageFor(error: unknown): string | null {
  if (error instanceof ApiRequestError) {
    return error.code === 'ABORTED' ? null : errorMessages[error.code];
  }
  if (error instanceof DOMException && error.name === 'AbortError') return null;
  // Photo and location errors are written for the user where they are thrown.
  if (error instanceof PhotoError || error instanceof LocateError) return error.message;
  return errorMessages.INTERNAL_ERROR;
}
