import assert from 'node:assert/strict';
import { test } from 'node:test';
import { solveChallenge, type Challenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { CAPTCHA_TTL_SECONDS, createCaptcha, DEFAULT_CAPTCHA_DIFFICULTY } from './captcha.js';

// Easy puzzles keep the suite fast; the real difficulty is checked separately below.
const difficulty = { cost: 10, minCounter: 5, maxCounter: 20 };

function clock(start = Date.now()) {
  let current = start;
  return { now: () => current, advance: (ms: number) => (current += ms) };
}

async function solve(challenge: Challenge): Promise<string> {
  const solution = await solveChallenge({ challenge, deriveKey });
  assert.ok(solution, 'challenge should be solvable');
  return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
}

test('a solved challenge verifies exactly once', async () => {
  const captcha = createCaptcha({ difficulty });
  const token = await solve(await captcha.createChallenge());
  assert.equal(await captcha.verify(token), true);
  assert.equal(await captcha.verify(token), false);
});

test('the same token sent twice at once is accepted only once', async () => {
  const captcha = createCaptcha({ difficulty });
  const token = await solve(await captcha.createChallenge());
  const results = await Promise.all([captcha.verify(token), captcha.verify(token), captcha.verify(token)]);
  assert.equal(results.filter(Boolean).length, 1);
});

test('a token is accepted until five minutes after the challenge was issued, then rejected', async () => {
  const time = clock();
  const captcha = createCaptcha({ difficulty, now: time.now });
  const early = await solve(await captcha.createChallenge());
  const late = await solve(await captcha.createChallenge());
  time.advance((CAPTCHA_TTL_SECONDS - 1) * 1_000);
  assert.equal(await captcha.verify(early), true);
  time.advance(2_000);
  assert.equal(await captcha.verify(late), false);
});

test('tampered, foreign, and garbage tokens are rejected', async () => {
  const captcha = createCaptcha({ difficulty });
  const challenge = await captcha.createChallenge();
  const solution = await solveChallenge({ challenge, deriveKey });
  assert.ok(solution);
  const encode = (payload: unknown) => Buffer.from(JSON.stringify(payload)).toString('base64');

  // Easier puzzle, pushed-out expiry, forged signature, wrong answer.
  const easier = { ...challenge, parameters: { ...challenge.parameters, cost: 1 } };
  const longer = { ...challenge, parameters: { ...challenge.parameters, expiresAt: challenge.parameters.expiresAt! + 3600 } };
  const forged = { ...challenge, signature: '0'.repeat(64) };
  const wrongAnswer = { ...solution, counter: solution.counter + 1 };
  assert.equal(await captcha.verify(encode({ challenge: easier, solution })), false);
  assert.equal(await captcha.verify(encode({ challenge: longer, solution })), false);
  assert.equal(await captcha.verify(encode({ challenge: forged, solution })), false);
  assert.equal(await captcha.verify(encode({ challenge, solution: wrongAnswer })), false);
  assert.equal(await captcha.verify(encode({ challenge: { parameters: challenge.parameters }, solution })), false);

  // Signed by another server (or before a restart without CAPTCHA_SECRET).
  const other = createCaptcha({ difficulty });
  assert.equal(await captcha.verify(await solve(await other.createChallenge())), false);

  for (const garbage of ['', 'not base64 at all', encode(null), encode({}), encode({ challenge: 1, solution: 2 })]) {
    assert.equal(await captcha.verify(garbage), false);
  }

  // The untouched token still works: rejections above did not burn it.
  assert.equal(await captcha.verify(encode({ challenge, solution })), true);
});

test('a configured secret lets a restarted server accept challenges it issued before', async () => {
  const before = createCaptcha({ difficulty, secret: 'stable-secret' });
  const after = createCaptcha({ difficulty, secret: 'stable-secret' });
  assert.equal(await after.verify(await solve(await before.createChallenge())), true);
});

test('real challenges use PBKDF2/SHA-256 at the tuned cost and expire in five minutes', async () => {
  const time = clock(1_800_000_000_000);
  const challenge = await createCaptcha({ now: time.now }).createChallenge();
  assert.equal(challenge.parameters.algorithm, 'PBKDF2/SHA-256');
  assert.equal(challenge.parameters.cost, DEFAULT_CAPTCHA_DIFFICULTY.cost);
  assert.equal(challenge.parameters.expiresAt, 1_800_000_000 + CAPTCHA_TTL_SECONDS);
  assert.equal(typeof challenge.signature, 'string');
});
