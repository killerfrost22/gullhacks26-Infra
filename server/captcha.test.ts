import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChallenge, solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/sha';
import type { Challenge, Payload } from 'altcha-lib';
import { CAPTCHA_TTL_MS, createCaptchaVerifier } from './captcha.js';

const secret = 'captcha-behavior-test-secret-not-a-production-credential';
const encode = (payload: unknown) => Buffer.from(JSON.stringify(payload)).toString('base64');

async function solve(challenge: Challenge): Promise<Payload> {
  const solution = await solveChallenge({ challenge, deriveKey });
  assert.ok(solution, 'The official solver must solve a genuine challenge.');
  // This is the exact v3 widget payload format, not a fabricated verification flag.
  return { challenge, solution };
}

test('genuine signed, expiring proofs are accepted once, and independent challenges remain usable', async () => {
  const verifier = createCaptchaVerifier({ secret });
  const first = await verifier.challenge();
  const second = await verifier.challenge();
  assert.notEqual(first.parameters.nonce, second.parameters.nonce);
  assert.ok(first.signature);
  assert.ok(first.parameters.expiresAt! * 1000 > Date.now());
  assert.ok(first.parameters.expiresAt! * 1000 <= Date.now() + CAPTCHA_TTL_MS);
  const token = encode(await solve(first));
  await verifier.verifyToken(token);
  await assert.rejects(verifier.verifyToken(token), { code: 'CAPTCHA_INVALID' });
  await verifier.verifyToken(encode(await solve(second)));
});

test('missing, malformed, oversized, and structurally invalid proofs fail closed', async () => {
  const verifier = createCaptchaVerifier({ secret });
  for (const token of [undefined, '', ' ']) {
    await assert.rejects(verifier.verifyToken(token), { code: 'CAPTCHA_REQUIRED' });
  }
  for (const token of ['not-base64!', 'A'.repeat(8193), 'e30', encode(null), encode({}), encode({ verified: true }), Buffer.from('{broken').toString('base64')]) {
    await assert.rejects(verifier.verifyToken(token), { code: 'CAPTCHA_INVALID' });
  }
});

test('tampering and forged solutions do not consume a legitimate challenge', async () => {
  const verifier = createCaptchaVerifier({ secret });
  const payload = await solve(await verifier.challenge());
  const modifiedPayloads = [
    { ...payload, challenge: { ...payload.challenge, signature: '0'.repeat(64) } },
    { ...payload, challenge: { ...payload.challenge, parameters: { ...payload.challenge.parameters, salt: '0'.repeat(32) } } },
    { ...payload, challenge: { ...payload.challenge, parameters: { ...payload.challenge.parameters, cost: 0 } } },
    { ...payload, challenge: { ...payload.challenge, parameters: { ...payload.challenge.parameters, expiresAt: undefined } } },
    { ...payload, solution: { ...payload.solution, derivedKey: '0'.repeat(64) } },
    ...[-1, 0.5, 0x100000000, '1', null].map((counter) => ({ ...payload, solution: { ...payload.solution, counter } })),
  ];
  for (const modified of modifiedPayloads) {
    await assert.rejects(verifier.verifyToken(encode(modified)), { code: 'CAPTCHA_INVALID' });
  }
  await verifier.verifyToken(encode(payload));
});

test('expired proofs fail at the exact deadline and cannot extend their signed expiry', async () => {
  let timestamp = Date.now();
  const verifier = createCaptchaVerifier({ secret, now: () => timestamp });
  const payload = await solve(await verifier.challenge());
  timestamp = payload.challenge.parameters.expiresAt! * 1000;
  await assert.rejects(verifier.verifyToken(encode(payload)), { code: 'CAPTCHA_INVALID' });
  const extended = { ...payload, challenge: { ...payload.challenge, parameters: { ...payload.challenge.parameters, expiresAt: timestamp / 1000 + 3600 } } };
  await assert.rejects(verifier.verifyToken(encode(extended)), { code: 'CAPTCHA_INVALID' });
});

test('proofs that expire during cryptographic verification also fail closed', async () => {
  let timestamp = Date.now();
  const verifier = createCaptchaVerifier({ secret, now: () => timestamp });
  const payload = await solve(await verifier.challenge());
  const verification = verifier.verifyToken(encode(payload));
  timestamp = payload.challenge.parameters.expiresAt! * 1000;
  await assert.rejects(verification, { code: 'CAPTCHA_INVALID' });
});

test('concurrent reuse has exactly one winner, including differently encoded JSON payloads', async () => {
  const verifier = createCaptchaVerifier({ secret });
  const payload = await solve(await verifier.challenge());
  const token = encode(payload);
  const reformatted = Buffer.from(JSON.stringify({ solution: payload.solution, challenge: payload.challenge }, null, 2)).toString('base64');
  const outcomes = await Promise.allSettled([
    verifier.verifyToken(token), verifier.verifyToken(reformatted), verifier.verifyToken(token),
  ]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  for (const result of outcomes) {
    if (result.status === 'rejected') assert.equal(result.reason.code, 'CAPTCHA_INVALID');
  }
  await assert.rejects(verifier.verifyToken(reformatted), { code: 'CAPTCHA_INVALID' });
});

test('valid signatures alone cannot bypass issuance or revive proofs after process-state loss', async () => {
  const firstProcess = createCaptchaVerifier({ secret });
  const restartedProcess = createCaptchaVerifier({ secret });
  const payload = await solve(await firstProcess.challenge());
  await assert.rejects(restartedProcess.verifyToken(encode(payload)), { code: 'CAPTCHA_INVALID' });
  const unissued = await createChallenge({ algorithm: 'SHA-256', cost: 1, counter: 1, deriveKey, hmacSignatureSecret: secret, expiresAt: new Date(Date.now() + CAPTCHA_TTL_MS) });
  await assert.rejects(firstProcess.verifyToken(encode(await solve(unissued))), { code: 'CAPTCHA_INVALID' });
  await firstProcess.verifyToken(encode(payload));
});
