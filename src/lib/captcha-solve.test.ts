import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { verify } from 'altcha-lib/frameworks/shared';
import { CaptchaSolveError, solveCaptcha } from './captcha-solve';

const secret = 'test-secret-not-real';

async function serverChallenge() {
  // Same shape the server issues: PBKDF2/SHA-256, deterministic counter, signed. Low cost keeps the test fast.
  return createChallenge({
    algorithm: 'PBKDF2/SHA-256',
    cost: 100,
    counter: 40,
    deriveKey,
    expiresAt: new Date(Date.now() + 5 * 60_000),
    hmacSignatureSecret: secret,
    hmacKeySignatureSecret: `${secret}-key`,
  });
}

test('the payload passes altcha-lib verification as the server runs it', async () => {
  const challenge = await serverChallenge();
  const payload = await solveCaptcha(JSON.parse(JSON.stringify(challenge)));

  const result = await verify(payload, deriveKey, secret, `${secret}-key`);
  assert.equal(result.error, null);

  const decoded = JSON.parse(atob(payload));
  assert.deepEqual(decoded.challenge, { parameters: challenge.parameters, signature: challenge.signature });
  assert.equal(decoded.solution.counter, 40);
  assert.match(decoded.solution.derivedKey, /^[0-9a-f]+$/);
});

test('malformed challenges and unsupported algorithms are rejected', async () => {
  await assert.rejects(solveCaptcha({ nope: true }), CaptchaSolveError);
  const challenge = await serverChallenge();
  await assert.rejects(
    solveCaptcha({ ...challenge, parameters: { ...challenge.parameters, algorithm: 'ARGON2ID' } }),
    CaptchaSolveError,
  );
});
