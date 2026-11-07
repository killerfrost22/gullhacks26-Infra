import { solveChallenge, type Challenge, type DeriveKeyFunction } from 'altcha-lib';
import { deriveKey as derivePbkdf2 } from 'altcha-lib/algorithms/web/pbkdf2';
import { deriveKey as deriveSha } from 'altcha-lib/algorithms/web/sha';

/** Thrown when a challenge can't be solved here; the API client turns it into CAPTCHA_INVALID. */
export class CaptchaSolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptchaSolveError';
  }
}

// Only key derivations WebCrypto can run in every browser. scrypt and Argon2id would need extra code on the device.
function deriveKeyFor(algorithm: string): DeriveKeyFunction {
  if (algorithm === 'PBKDF2/SHA-256' || algorithm === 'PBKDF2/SHA-384' || algorithm === 'PBKDF2/SHA-512') {
    return derivePbkdf2;
  }
  if (algorithm === 'SHA-256' || algorithm === 'SHA-384' || algorithm === 'SHA-512') return deriveSha;
  throw new CaptchaSolveError(`Unsupported bot-check algorithm: ${algorithm}`);
}

function asChallenge(value: unknown): Challenge {
  const parameters = (value as { parameters?: unknown } | null)?.parameters as Record<string, unknown> | undefined;
  if (
    !parameters ||
    typeof parameters.algorithm !== 'string' ||
    typeof parameters.nonce !== 'string' ||
    typeof parameters.salt !== 'string' ||
    typeof parameters.keyPrefix !== 'string' ||
    typeof parameters.cost !== 'number'
  ) {
    throw new CaptchaSolveError('The bot-check challenge is malformed.');
  }
  return value as Challenge;
}

function toBase64Utf8(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Solves an ALTCHA v2 challenge (as returned by altcha-lib `createChallenge`) and returns the
 * payload altcha-lib's verifier expects: base64 of `{ challenge: { parameters, signature }, solution }`.
 */
export async function solveCaptcha(value: unknown, controller?: AbortController): Promise<string> {
  const challenge = asChallenge(value);
  const solution = await solveChallenge({
    challenge,
    controller,
    deriveKey: deriveKeyFor(challenge.parameters.algorithm),
    timeout: 60_000,
  });
  if (!solution) throw new CaptchaSolveError('The bot check timed out.');
  return toBase64Utf8(
    JSON.stringify({ challenge: { parameters: challenge.parameters, signature: challenge.signature }, solution }),
  );
}
