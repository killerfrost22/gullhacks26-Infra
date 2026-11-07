import { z } from 'zod';
import type { InvestigationRequest } from '../shared/types.js';
import { ApiError } from './errors.js';

export const locationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  label: z.string().trim().min(1).max(1000),
  address: z.object({
    street: z.string().trim().min(1).max(300).nullable(),
    city: z.string().trim().min(1).max(300).nullable(),
    houseNumber: z.string().trim().min(1).max(80).nullable(),
  }).strict().nullable(),
}).strict();

const requestSchema = z.object({
  photoDataUrl: z.string().max(5_600_023),
  location: locationSchema,
  details: z.string().trim().max(1500),
}).strict();

export function parseInvestigationRequest(input: unknown): InvestigationRequest {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, 'Provide a JPEG photo, a confirmed valid location, and details of at most 1500 characters.', 'INVALID_INPUT');
  }
  const { photoDataUrl } = parsed.data;
  const prefix = 'data:image/jpeg;base64,';
  if (!photoDataUrl.startsWith(prefix)) {
    throw new ApiError(400, 'The photo must be a prepared JPEG image.', 'INVALID_PHOTO');
  }
  const base64 = photoDataUrl.slice(prefix.length);
  if (base64.length < 8 || base64.length > 5_600_000 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new ApiError(400, 'The JPEG photo is invalid or too large. Choose a smaller image.', 'INVALID_PHOTO');
  }
  // Check both JPEG markers without decoding/copying the entire upload.
  const first = Buffer.from(base64.slice(0, 8), 'base64');
  const last = Buffer.from(base64.slice(-8), 'base64');
  if (first[0] !== 0xff || first[1] !== 0xd8 || first[2] !== 0xff || last.at(-2) !== 0xff || last.at(-1) !== 0xd9) {
    throw new ApiError(400, 'The photo is not a valid JPEG image.', 'INVALID_PHOTO');
  }
  return parsed.data;
}

export function parseCoordinate(value: unknown, kind: 'latitude' | 'longitude'): number {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError(400, 'Both latitude and longitude are required.', 'INVALID_COORDINATES');
  }
  const number = Number(value);
  const limit = kind === 'latitude' ? 90 : 180;
  if (!Number.isFinite(number) || Math.abs(number) > limit) {
    throw new ApiError(400, 'Coordinates are outside the valid world bounds.', 'INVALID_COORDINATES');
  }
  return number;
}
