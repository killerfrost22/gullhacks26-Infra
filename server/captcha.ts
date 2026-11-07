import { randomBytes, randomInt } from 'node:crypto';
import { createChallenge, verifySolution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/sha';
import type { Challenge } from 'altcha-lib';
import { z } from 'zod';
import { ApiError } from './errors.js';

export const CAPTCHA_TTL_MS = 5 * 60_000;
const MAX_OUTSTANDING_CHALLENGES = 10_000;
const processSecret = randomBytes(32).toString('hex');
const hex = (length: number) => z.string().regex(new RegExp(`^[0-9a-f]{${length}}$`));
const payloadSchema = z.object({
  challenge: z.object({
    parameters: z.object({
      algorithm: z.literal('SHA-256'),
      cost: z.literal(1),
      keyLength: z.literal(32),
      keyPrefix: hex(32),
      nonce: hex(32),
      salt: hex(32),
      expiresAt: z.number().int().positive(),
    }).strict(),
    signature: hex(64),
  }).strict(),
  solution: z.object({
    counter: z.number().int().min(0).max(0xffffffff),
    derivedKey: hex(64),
    time: z.number().finite().nonnegative().optional(),
  }).strict(),
}).strict();

export interface CaptchaVerifier {
  challenge: () => Promise<Challenge>;
  verifyToken: (token: string | undefined) => Promise<void>;
}

/** Local issuance state fails closed on restarts; use a single API process or sticky routing. */
export function createCaptchaVerifier({
  secret = process.env.CAPTCHA_SECRET?.trim() || processSecret,
  now = Date.now,
}: { secret?: string; now?: () => number } = {}): CaptchaVerifier {
  if (!secret.trim()) throw new Error('CAPTCHA_SECRET must not be empty when explicitly provided.');
  const outstanding = new Map<string, { signature: string; expiresAt: number }>();
  let nextPruneAt = 0;
  const prune = () => {
    const timestamp = now();
    if (timestamp < nextPruneAt && outstanding.size < MAX_OUTSTANDING_CHALLENGES) return;
    for (const [nonce, record] of outstanding) {
      if (record.expiresAt <= timestamp) outstanding.delete(nonce);
    }
    nextPruneAt = timestamp + 60_000;
  };
  const invalid = () => new ApiError(403, 'The security check expired or could not be verified. Complete a new security check and try again.', 'CAPTCHA_INVALID');

  return {
    async challenge() {
      prune();
      if (outstanding.size >= MAX_OUTSTANDING_CHALLENGES) {
        throw new ApiError(503, 'Security checks are busy. Please wait a minute and try again.', 'CAPTCHA_UNAVAILABLE');
      }
      const challenge = await createChallenge({
        algorithm: 'SHA-256', cost: 1, counter: randomInt(25_000, 75_001), deriveKey,
        expiresAt: Math.floor((now() + CAPTCHA_TTL_MS) / 1000), hmacSignatureSecret: secret,
      });
      // Recheck after asynchronous signing; never evict a live record to make room.
      if (outstanding.size >= MAX_OUTSTANDING_CHALLENGES) {
        throw new ApiError(503, 'Security checks are busy. Please wait a minute and try again.', 'CAPTCHA_UNAVAILABLE');
      }
      outstanding.set(challenge.parameters.nonce, {
        signature: challenge.signature!, expiresAt: challenge.parameters.expiresAt! * 1000,
      });
      return challenge;
    },
    async verifyToken(token) {
      if (!token?.trim()) {
        throw new ApiError(403, 'Complete the security check before generating your report.', 'CAPTCHA_REQUIRED');
      }
      try {
        if (token.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(token)) throw invalid();
        const decoded = Buffer.from(token, 'base64');
        if (decoded.toString('base64') !== token) throw invalid();
        const { challenge, solution } = payloadSchema.parse(JSON.parse(decoded.toString('utf8')));
        const nonce = challenge.parameters.nonce;
        const record = outstanding.get(nonce);
        if (!record || record.signature !== challenge.signature || record.expiresAt <= now()) throw invalid();
        const result = await verifySolution({ challenge, solution, deriveKey, hmacSignatureSecret: secret });
        if (!result.verified || record.expiresAt <= now()) throw invalid();
        // The identity check and delete are synchronous after crypto awaits. Exactly one concurrent request wins.
        if (outstanding.get(nonce) !== record) throw invalid();
        outstanding.delete(nonce);
      } catch {
        // Never expose payloads, cryptographic errors, or the signing secret in public responses.
        throw invalid();
      }
    },
  };
}
