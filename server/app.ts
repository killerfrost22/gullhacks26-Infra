import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import express, { type ErrorRequestHandler, type Express, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  CAPTCHA_HEADER,
  INVESTIGATION_BODY_LIMIT_BYTES,
  type Coordinates,
  type Health,
  type Investigation,
  type InvestigationRequest,
  type LocationContext,
  type Place,
} from '../shared/types.js';
import type { Captcha } from './captcha.js';
import type { ServerConfig } from './config.js';
import { ApiError } from './errors.js';
import { parseCoordinatesQuery, parseInvestigationRequest, parseSearchQuery } from './validation.js';

export interface GeoDeps {
  searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]>;
  reversePlace(point: Coordinates, signal?: AbortSignal): Promise<Place | null>;
  getLocationContext(point: Coordinates, signal?: AbortSignal): Promise<LocationContext>;
}

export interface ResearchDeps {
  researchConfigured(): boolean;
  investigate(
    request: InvestigationRequest,
    options?: {
      signal?: AbortSignal;
      getContext?: (point: Coordinates, signal?: AbortSignal) => Promise<LocationContext>;
    },
  ): Promise<Investigation>;
}

export interface AppDeps {
  geo: GeoDeps;
  research: ResearchDeps;
  captcha: Pick<Captcha, 'createChallenge' | 'verify'>;
  config: Pick<ServerConfig, 'trustProxy' | 'researchRateLimit' | 'distDir'>;
}

const MINUTE = 60_000;
const SMALL_BODY_LIMIT = '16kb';

function limiter(windowMs: number, limit: number, error: ApiError) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(error.status).json(error.toBody());
    },
  });
}

/**
 * Runs `work` and sends its result as JSON. The signal aborts if the client goes away first, so upstream work
 * (Gemini, the geocoder) stops too; nothing is sent or logged for a request nobody is waiting for.
 */
async function sendWhileConnected(res: Response, work: (signal: AbortSignal) => Promise<unknown>): Promise<void> {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  try {
    const body = await work(controller.signal);
    if (!controller.signal.aborted) res.json(body);
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  }
}

/** `Origin` must be present and name the host the request was sent to. Default ports are equivalent to none. */
function isSameOrigin(req: Request): boolean {
  const origin = req.get('origin');
  const host = req.get('host')?.toLowerCase();
  if (!origin || !host) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const defaultPort = url.protocol === 'https:' ? ':443' : ':80';
  const hostWithoutDefaultPort = host.endsWith(defaultPort) ? host.slice(0, -defaultPort.length) : host;
  return url.host === hostWithoutDefaultPort;
}

/** Text-like files worth compressing. Images and fonts are already compressed formats and are left to express.static. */
const TEXT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

type ContentEncoding = 'br' | 'gzip' | 'identity';

interface EncodedFile {
  body: Buffer;
  etag: string;
}

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** Maps a URL path to a file under `root`, or `null` for traversal, dotfiles, malformed escapes, or the root itself. */
function resolveInside(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.split(/[\\/]/).some((segment) => segment.startsWith('.'))) return null;
  const file = join(root, decoded);
  const fromRoot = relative(root, file);
  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) return null;
  return file;
}

/**
 * Serves text files from the build compressed with Brotli or gzip. Each file is read and compressed once per
 * encoding, off the main thread, then kept in memory: `dist/` does not change while the process runs.
 */
function createTextFileServer() {
  const cache = new Map<string, Promise<EncodedFile>>();

  async function encodeFile(file: string, encoding: ContentEncoding): Promise<EncodedFile> {
    const raw = await readFile(file);
    const body =
      encoding === 'br'
        ? await brotliAsync(raw, {
            params: {
              [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
              [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
              [zlibConstants.BROTLI_PARAM_SIZE_HINT]: raw.length,
            },
          })
        : encoding === 'gzip'
          ? await gzipAsync(raw, { level: 9 })
          : raw;
    const hash = createHash('sha256').update(raw).digest('base64url').slice(0, 22);
    return { body, etag: `"${hash}-${encoding}"` };
  }

  /** Sends `file` and returns true, or returns false if it isn't a text file that exists. */
  return async function send(req: Request, res: Response, file: string, cacheControl: string): Promise<boolean> {
    const type = TEXT_TYPES[extname(file).toLowerCase()];
    if (!type) return false;
    const encoding: ContentEncoding =
      req.acceptsEncodings('br') === 'br' ? 'br' : req.acceptsEncodings('gzip') === 'gzip' ? 'gzip' : 'identity';
    const key = `${file}\0${encoding}`;
    let encoded = cache.get(key);
    if (!encoded) {
      // Misses are not cached, so requests for made-up paths can't grow the cache.
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) return false;
      encoded = encodeFile(file, encoding);
      cache.set(key, encoded);
      encoded.catch(() => cache.delete(key));
    }
    const { body, etag } = await encoded;
    res.vary('Accept-Encoding');
    res.set({ 'Content-Type': type, 'Cache-Control': cacheControl, ETag: etag });
    if (encoding !== 'identity') res.set('Content-Encoding', encoding);
    // res.send sets Content-Length, answers If-None-Match with 304, and omits the body for HEAD.
    res.send(body);
    return true;
  };
}

export function createApp(deps: AppDeps): Express {
  const { geo, research, captcha, config } = deps;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(self), geolocation=(self)',
    });
    next();
  });

  // API answers are per-request (locations, reports, single-use challenges); no cache should keep them.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const rateLimited = new ApiError(429, 'Too many requests. Wait a minute and try again.', 'RATE_LIMITED');

  app.post(
    '/api/investigate',
    (req, _res, next) => {
      if (!isSameOrigin(req)) {
        throw new ApiError(403, 'Reports can only be requested from the Fix Please page itself.', 'FORBIDDEN_ORIGIN');
      }
      next();
    },
    limiter(
      15 * MINUTE,
      config.researchRateLimit,
      new ApiError(429, "That's a lot of reports in a short time. Try again in 15 minutes.", 'RESEARCH_RATE_LIMITED'),
    ),
    async (req, _res, next) => {
      const token = req.get(CAPTCHA_HEADER)?.trim();
      if (!token) {
        throw new ApiError(403, "The quick bot check didn't finish. Try again.", 'CAPTCHA_REQUIRED');
      }
      if (!(await captcha.verify(token))) {
        throw new ApiError(403, 'The bot check expired or was already used. Try again.', 'CAPTCHA_INVALID');
      }
      next();
    },
    express.json({ limit: INVESTIGATION_BODY_LIMIT_BYTES }),
    async (req, res) => {
      const request = parseInvestigationRequest(req.body);
      await sendWhileConnected(res, (signal) =>
        research.investigate(request, { signal, getContext: geo.getLocationContext }),
      );
    },
  );

  app.use('/api', express.json({ limit: SMALL_BODY_LIMIT }));

  app.get('/api/health', (_req, res) => {
    const health: Health = { researchConfigured: research.researchConfigured() };
    res.json(health);
  });

  app.get('/api/captcha/challenge', limiter(MINUTE, 20, rateLimited), async (_req, res) => {
    res.json(await captcha.createChallenge());
  });

  app.get('/api/locations/search', limiter(MINUTE, 30, rateLimited), async (req, res) => {
    const query = parseSearchQuery(req.query);
    await sendWhileConnected(res, async (signal) => (await geo.searchPlaces(query, signal)).slice(0, 5));
  });

  app.get('/api/locations/reverse', limiter(MINUTE, 30, rateLimited), async (req, res) => {
    const point = parseCoordinatesQuery(req.query);
    await sendWhileConnected(res, (signal) => geo.reversePlace(point, signal));
  });

  app.get('/api/locations/context', limiter(MINUTE, 30, rateLimited), async (req, res) => {
    const point = parseCoordinatesQuery(req.query);
    await sendWhileConnected(res, (signal) => geo.getLocationContext(point, signal));
  });

  app.use('/api', (_req, res) => {
    res.status(404).json(new ApiError(404, "That API endpoint doesn't exist.", 'NOT_FOUND').toBody());
  });

  const indexFile = join(config.distDir, 'index.html');
  if (existsSync(indexFile)) {
    const assetsDir = join(config.distDir, 'assets');
    const sendTextFile = createTextFileServer();
    // Vite puts a content hash in every file name under assets/, so a changed file always gets a new URL.
    const IMMUTABLE = 'public, max-age=31536000, immutable';

    app.use('/assets', async (req, res, next) => {
      const file = req.method === 'GET' || req.method === 'HEAD' ? resolveInside(assetsDir, req.path) : null;
      if (file && (await sendTextFile(req, res, file, IMMUTABLE))) return;
      next();
    });
    app.use('/assets', express.static(assetsDir, { immutable: true, maxAge: '1y', index: false }));
    // A missing hashed asset must 404; answering with index.html would hand the browser HTML as a script.
    app.use('/assets', (_req, res) => {
      res.status(404).type('text/plain').send('Not found');
    });

    app.use(async (req, res, next) => {
      const file = req.method === 'GET' || req.method === 'HEAD' ? resolveInside(config.distDir, req.path) : null;
      const cacheControl = file && basename(file) === 'index.html' ? 'no-cache' : 'public, max-age=0';
      if (file && (await sendTextFile(req, res, file, cacheControl))) return;
      next();
    });
    app.use(express.static(config.distDir, { index: false }));
    // Client-side routes (/, /tech, /privacy, anything else) all load the app shell.
    app.use(async (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (!(await sendTextFile(req, res, indexFile, 'no-cache'))) next();
    });
  }

  const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ApiError) {
      res.status(error.status).json(error.toBody());
      return;
    }
    // body-parser errors carry a `type`; their raw `body` is never logged or echoed.
    const type = typeof error === 'object' && error !== null && 'type' in error ? String(error.type) : '';
    if (type === 'entity.too.large') {
      const tooLarge = new ApiError(413, 'That photo is too large to send. Try a smaller photo.', 'PAYLOAD_TOO_LARGE');
      res.status(413).json(tooLarge.toBody());
      return;
    }
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 500;
    if (type !== '' && status >= 400 && status < 500) {
      const invalid = new ApiError(400, "Something about that request didn't look right. Reload the page and try again.", 'INVALID_REQUEST');
      res.status(400).json(invalid.toBody());
      return;
    }
    // Only the stack: error objects can hold request data (bodies, photos) in extra properties.
    const detail = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
    console.error(`Unexpected error on ${req.method} ${req.path}: ${detail.slice(0, 4000)}`);
    const internal = new ApiError(500, 'Something went wrong on our side. Try again in a moment.', 'INTERNAL_ERROR');
    res.status(500).json(internal.toBody());
  };
  app.use(errorHandler);

  return app;
}
