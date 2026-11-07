import assert from 'node:assert/strict';
import { test } from 'node:test';
import { API_ERROR_CODES } from '../../shared/types';
import { ApiRequestError } from './api';
import { LocateError } from './geolocate';
import { errorMessages, messageFor } from './messages';
import { PhotoError } from './photo';

test('every API error code and network failure has a plain-language message', () => {
  for (const code of [...API_ERROR_CODES, 'NETWORK_ERROR' as const]) {
    const message = errorMessages[code];
    assert.ok(message && message.length > 10, code);
    assert.doesNotMatch(message, /[A-Z]{2,}_[A-Z]/, `${code} message shows no internal code`);
  }
});

test('uses the README wording for lookup problems', () => {
  assert.equal(messageFor(new ApiRequestError(503, 'x', 'RESEARCH_UNAVAILABLE')), 'Report lookup is offline right now.');
  assert.match(messageFor(new ApiRequestError(503, 'x', 'RESEARCH_QUOTA'))!, /^We've hit our lookup limit for now\./);
  assert.equal(
    messageFor(new ApiRequestError(429, 'x', 'RESEARCH_RATE_LIMITED')),
    "That's a lot of reports in a short time. Give it a few minutes and try again.",
  );
});

test('server text is never shown in place of our message', () => {
  const error = new ApiRequestError(502, 'upstream 500 from provider: quota project 1234', 'RESEARCH_FAILED');
  assert.equal(messageFor(error), errorMessages.RESEARCH_FAILED);
});

test('cancelling shows nothing', () => {
  assert.equal(messageFor(new ApiRequestError(0, 'cancelled', 'ABORTED')), null);
  assert.equal(messageFor(new DOMException('cancelled', 'AbortError')), null);
});

test('photo and location errors keep their own messages; unknown errors get a generic one', () => {
  assert.equal(messageFor(new PhotoError('TOO_LARGE')), new PhotoError('TOO_LARGE').message);
  assert.equal(messageFor(new LocateError('DENIED')), new LocateError('DENIED').message);
  assert.equal(messageFor(new Error('TypeError: x is undefined')), errorMessages.INTERNAL_ERROR);
});
