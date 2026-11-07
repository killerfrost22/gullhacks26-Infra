import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ApiError } from './errors.js';
import { createCaptchaVerifier } from './captcha.js';
import type { CaptchaVerifier } from './captcha.js';
import { searchLocations, reverseLocation } from './geocoder.js';
import { getLocationContext } from './context.js';
import type { LocationContextLookup } from './context.js';
import { investigate } from './research.js';
import { parseCoordinate, parseInvestigationRequest } from './validation.js';

/** TRUST_PROXY: unset/"false" trusts no proxy headers; "true" trusts all; an integer trusts that many proxy hops. */
export function trustProxySetting(value = process.env.TRUST_PROXY?.trim()): boolean | number {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d{1,2}$/.test(value)) return Number(value);
  throw new Error('TRUST_PROXY must be unset, "false", "true", or a proxy hop count such as 1.');
}

/** RESEARCH_RATE_LIMIT: research requests per 15 minutes per client address (default 5). */
export function researchRateLimit(value = process.env.RESEARCH_RATE_LIMIT?.trim()): number {
  if (!value) return 5;
  const limit = Number(value);
  if (!/^\d+$/.test(value) || limit < 1 || limit > 10_000) throw new Error('RESEARCH_RATE_LIMIT must be a whole number from 1 to 10000.');
  return limit;
}

function requestSignal(request: Request, response: Response): AbortSignal {
  const controller = new AbortController();
  const cancel = () => { if (!response.writableEnded) controller.abort(); };
  const cleanup = () => { request.off('aborted', cancel); response.off('close', cancel); };
  request.once('aborted', cancel);
  response.once('close', cancel);
  response.once('finish', cleanup);
  response.once('close', cleanup);
  if (request.aborted || response.destroyed) controller.abort();
  return controller.signal;
}

export function createApp({
  research = investigate,
  captcha = createCaptchaVerifier(),
  locationContext = getLocationContext,
}: { research?: typeof investigate; captcha?: CaptchaVerifier; locationContext?: LocationContextLookup } = {}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  // Proxy headers decide the client address used by cost limits; trust them only when deployment config says so.
  app.set('trust proxy', trustProxySetting());
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/api/health', (_request, response) => {
    response.json({ researchConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()), model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' });
  });
  const challengeLimit = rateLimit({
    windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_request, response) => { response.status(429).json({ error: 'Too many security checks. Please wait a minute and try again.', code: 'CAPTCHA_RATE_LIMITED' }); },
  });
  app.get('/api/captcha/challenge', challengeLimit, async (_request, response, next) => {
    try { response.json(await captcha.challenge()); }
    catch (error) { next(error); }
  });
  const locationLimit = rateLimit({
    windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_request, response) => { response.status(429).json({ error: 'Too many location lookups. Please wait a minute.', code: 'LOCATION_RATE_LIMITED' }); },
  });
  app.get('/api/locations/search', locationLimit, async (request, response, next) => {
    try {
      const results = await searchLocations(request.query.q, requestSignal(request, response));
      if (!response.destroyed) response.json({ results });
    } catch (error) { next(error); }
  });
  app.get('/api/locations/reverse', locationLimit, async (request, response, next) => {
    try {
      const latitude = parseCoordinate(request.query.lat, 'latitude');
      const longitude = parseCoordinate(request.query.lon, 'longitude');
      const result = await reverseLocation(latitude, longitude, requestSignal(request, response));
      if (!response.destroyed) response.json({ result });
    } catch (error) { next(error); }
  });
  app.get('/api/locations/context', locationLimit, async (request, response, next) => {
    try {
      const latitude = parseCoordinate(request.query.lat, 'latitude');
      const longitude = parseCoordinate(request.query.lon, 'longitude');
      // Shared, cached lookup: it keeps running if this client leaves, so the later investigation finds it ready.
      const context = await locationContext(latitude, longitude);
      if (!response.destroyed) response.json({ context });
    } catch (error) { next(error); }
  });
  const researchLimitPerWindow = researchRateLimit();
  const researchLimit = rateLimit({
    windowMs: 15 * 60_000, limit: researchLimitPerWindow, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        error: `Research is limited to ${researchLimitPerWindow} ${researchLimitPerWindow === 1 ? 'request' : 'requests'} per 15 minutes per network address. Please wait before trying again.`,
        code: 'RESEARCH_RATE_LIMITED',
      });
    },
  });
  app.post('/api/investigate', (request, _response, next) => {
    const origin = request.get('origin');
    if (request.get('sec-fetch-site') === 'cross-site') {
      next(new ApiError(403, 'Research requests must come from this app.', 'ORIGIN_NOT_ALLOWED'));
      return;
    }
    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.host !== request.get('host')) throw new Error('Origin mismatch');
      } catch {
        next(new ApiError(403, 'Research requests must come from this app.', 'ORIGIN_NOT_ALLOWED'));
        return;
      }
    }
    if (!request.is('application/json')) {
      next(new ApiError(415, 'Send research requests as application/json.', 'JSON_REQUIRED'));
      return;
    }
    next();
  }, researchLimit, express.json({ limit: '6mb', strict: true }), async (request, response, next) => {
    try {
      const input = parseInvestigationRequest(request.body);
      await captcha.verifyToken(request.get('X-Captcha-Token'));
      if (!process.env.GEMINI_API_KEY?.trim()) {
        throw new ApiError(503, 'Research requires a server-side GEMINI_API_KEY. Add it to .env and restart the server; photo and location tools remain available.', 'RESEARCH_NOT_CONFIGURED');
      }
      const result = await research(input, requestSignal(request, response));
      if (!response.destroyed) response.json(result);
    } catch (error) { next(error); }
  });
  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API endpoint not found.', code: 'NOT_FOUND' });
  });
  const distPath = fileURLToPath(new URL('../dist/', import.meta.url));
  const indexPath = fileURLToPath(new URL('../dist/index.html', import.meta.url));
  if (existsSync(indexPath)) {
    app.use(express.static(distPath, { index: false }));
    app.use((request, response, next) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') { next(); return; }
      if (!request.accepts('html')) { next(); return; }
      response.sendFile(indexPath);
    });
  }
  app.use((_request, response) => { response.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' }); });
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (response.destroyed || response.headersSent) return;
    if (error instanceof ApiError) {
      response.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    const bodyError = error as { type?: string } | null;
    if (bodyError?.type === 'entity.too.large') {
      response.status(413).json({ error: 'The photo request is too large. Choose a smaller image.', code: 'REQUEST_TOO_LARGE' });
    } else if (bodyError?.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'The request body must be valid JSON.', code: 'INVALID_JSON' });
    } else {
      response.status(500).json({ error: 'The server could not complete this request.', code: 'INTERNAL_ERROR' });
    }
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  // Express 5 calls this with the listen error too, so a busy port must not print "ready".
  createApp().listen(port, host, (error?: NodeJS.ErrnoException) => {
    if (error?.code === 'EADDRINUSE') {
      // Otherwise the dev proxy quietly forwards /api to whatever else owns the port.
      console.error(`\nPort ${port} is already used by another program, so the fixplease.app API did not start.\nSet PORT in .env to a free port (for example ${port + 3}) and restart.\n`);
      process.exit(1);
    }
    if (error) throw error;
    const displayHost = host.includes(':') ? `[${host}]` : host;
    console.log(`fixplease.app ready at http://${displayHost}:${port}`);
  });
}
