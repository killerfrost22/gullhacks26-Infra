import test from 'node:test';
import assert from 'node:assert/strict';
import { geminiProviderError } from './gemini-client.js';

test('a tool-call limit reported as HTTP 400 is not mislabeled as an unsupported model', () => {
  const error = geminiProviderError(400, { error: 'Model generated too many tool calls. Please retry the request.' });
  assert.equal(error.code, 'RESEARCH_TOOL_LIMIT');
  assert.equal(error.status, 502);
});

test('invalid keys reported as HTTP 400 are recognized in both Interactions and Google RPC errors', () => {
  for (const payload of [
    { error: 'API key not valid. Please pass a valid API key.' },
    { error: { message: 'Bad request', details: [{ reason: 'API_KEY_INVALID' }] } },
  ]) {
    const error = geminiProviderError(400, payload);
    assert.equal(error.code, 'RESEARCH_AUTH_FAILED');
    assert.equal(error.status, 503);
  }
});

test('quota exhaustion, unavailable models, and other rejected requests remain distinguishable', () => {
  assert.equal(geminiProviderError(429, { error: { message: 'Resource exhausted' } }).code, 'RESEARCH_QUOTA');
  assert.equal(geminiProviderError(404, { error: 'Model not found' }).code, 'RESEARCH_MODEL_ERROR');
  assert.equal(geminiProviderError(400, { error: 'Invalid request field' }).code, 'RESEARCH_REQUEST_REJECTED');
});

test('provider errors never echo private request content into the public API error', () => {
  const privateContent = 'PRIVATE-REPORT-CONTENT-AND-SECRET';
  const error = geminiProviderError(400, { error: { message: `Invalid field: ${privateContent}` } });
  assert.equal(error.code, 'RESEARCH_REQUEST_REJECTED');
  assert.equal(error.message.includes(privateContent), false);
});
