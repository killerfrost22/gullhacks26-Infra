import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  host: string;
  port: number;
  /** Value for Express `trust proxy`: `false`, `true` (every hop), or a hop count. */
  trustProxy: boolean | number;
  /** Reports allowed per client address every 15 minutes. */
  researchRateLimit: number;
  /** Stable ALTCHA signing secret, or `null` for a random per-process one. */
  captchaSecret: string | null;
  /** Production build served by the API (`npm run build` output). */
  distDir: string;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const DEFAULT_RESEARCH_RATE_LIMIT = 5;
const DEFAULT_DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url));

export function parseTrustProxy(raw: string | undefined, warn: (message: string) => void): boolean | number {
  const value = raw?.trim() ?? '';
  if (value === '' || value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    // Zero hops means "trust nothing", which is what `false` says without the ambiguity.
    return hops === 0 ? false : hops;
  }
  warn(`TRUST_PROXY="${value}" is not understood. Use a number of proxy hops (usually 1), "true", or leave it blank. Ignoring it.`);
  return false;
}

function parsePositiveInt(name: string, raw: string | undefined, fallback: number, warn: (message: string) => void): number {
  const value = raw?.trim() ?? '';
  if (value === '') return fallback;
  if (/^\d+$/.test(value) && Number(value) > 0) return Number(value);
  warn(`${name}="${value}" is not a positive whole number. Using ${fallback}.`);
  return fallback;
}

function parsePort(raw: string | undefined, warn: (message: string) => void): number {
  const value = raw?.trim() ?? '';
  if (value === '') return DEFAULT_PORT;
  if (/^\d+$/.test(value) && Number(value) <= 65535) return Number(value);
  warn(`PORT="${value}" is not a valid port. Using ${DEFAULT_PORT}.`);
  return DEFAULT_PORT;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = (message) => console.warn(message),
): ServerConfig {
  const captchaSecret = env.CAPTCHA_SECRET?.trim() ?? '';
  return {
    host: env.HOST?.trim() || DEFAULT_HOST,
    port: parsePort(env.PORT, warn),
    trustProxy: parseTrustProxy(env.TRUST_PROXY, warn),
    researchRateLimit: parsePositiveInt('RESEARCH_RATE_LIMIT', env.RESEARCH_RATE_LIMIT, DEFAULT_RESEARCH_RATE_LIMIT, warn),
    captchaSecret: captchaSecret === '' ? null : captchaSecret,
    distDir: DEFAULT_DIST_DIR,
  };
}
