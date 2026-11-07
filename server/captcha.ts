import { randomBytes } from 'node:crypto';
import { createChallenge, randomInt, verifySolution, type Challenge, type Payload } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';

/** Challenges and solved tokens are valid this long after they are issued. */
export const CAPTCHA_TTL_SECONDS = 5 * 60;

/**
 * Work per challenge. The solver tries counters 0, 1, 2, ... and each try is one PBKDF2 run of `cost` rounds.
 * About 1,500 tries of 1,000 rounds is roughly 0.3–1 s on a mid-range phone with WebCrypto, and one
 * 1,000-round run (well under 1 ms) for the server to check.
 */
export interface CaptchaDifficulty {
  cost: number;
  minCounter: number;
  maxCounter: number;
}

export const DEFAULT_CAPTCHA_DIFFICULTY: CaptchaDifficulty = { cost: 1_000, minCounter: 1_000, maxCounter: 2_000 };

const ALGORITHM = 'PBKDF2/SHA-256';

export interface CaptchaOptions {
  /** `CAPTCHA_SECRET`. Without one, a random secret is made per process, so a restart invalidates open challenges. */
  secret?: string | null;
  /** Milliseconds since the epoch. Injectable for tests. */
  now?: () => number;
  difficulty?: CaptchaDifficulty;
}

export interface Captcha {
  /** A signed ALTCHA v2 challenge `{ parameters, signature }`, expiring in five minutes. */
  createChallenge(): Promise<Challenge>;
  /** True once for a valid, unexpired, untampered token (base64 JSON `{ challenge, solution }`); false afterwards. */
  verify(token: string): Promise<boolean>;
}

function decodeToken(token: string): Payload | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (typeof payload !== 'object' || payload === null) return null;
    const { challenge, solution } = payload as Partial<Payload>;
    if (typeof challenge !== 'object' || challenge === null) return null;
    if (typeof challenge.parameters !== 'object' || challenge.parameters === null) return null;
    if (typeof challenge.signature !== 'string') return null;
    if (typeof solution !== 'object' || solution === null) return null;
    return { challenge, solution };
  } catch {
    return null;
  }
}

export function createCaptcha(options: CaptchaOptions = {}): Captcha {
  const secret = options.secret || randomBytes(32).toString('hex');
  const now = options.now ?? Date.now;
  const difficulty = options.difficulty ?? DEFAULT_CAPTCHA_DIFFICULTY;
  /** Nonces of tokens already accepted, mapped to their expiry (seconds). Expired entries are pruned. */
  const used = new Map<string, number>();

  const nowSeconds = () => now() / 1_000;

  function prune() {
    const current = nowSeconds();
    for (const [nonce, expiresAt] of used) {
      if (expiresAt < current) used.delete(nonce);
    }
  }

  return {
    async createChallenge() {
      prune();
      return createChallenge({
        algorithm: ALGORITHM,
        cost: difficulty.cost,
        counter: randomInt(difficulty.maxCounter, difficulty.minCounter),
        deriveKey,
        expiresAt: Math.floor(nowSeconds()) + CAPTCHA_TTL_SECONDS,
        hmacSignatureSecret: secret,
      });
    },

    async verify(token) {
      prune();
      const payload = decodeToken(token);
      if (!payload) return false;
      const { parameters } = payload.challenge;
      // Every challenge we issue expires; one without expiry was not made here.
      if (typeof parameters.expiresAt !== 'number' || parameters.expiresAt < nowSeconds()) return false;
      if (typeof parameters.nonce !== 'string' || used.has(parameters.nonce)) return false;
      try {
        const result = await verifySolution({
          challenge: payload.challenge,
          solution: payload.solution,
          deriveKey,
          hmacSignatureSecret: secret,
        });
        if (!result.verified) return false;
      } catch {
        // Malformed parameters that still carry a valid signature can't exist, but never let one crash the request.
        return false;
      }
      // Re-check after the await: two copies of one token may have been verified concurrently.
      if (used.has(parameters.nonce)) return false;
      used.set(parameters.nonce, parameters.expiresAt);
      return true;
    },
  };
}
