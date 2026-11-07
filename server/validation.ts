import { z } from 'zod';
import { DETAILS_MAX_LENGTH, type Coordinates, type InvestigationRequest, type Place } from '../shared/types.js';
import { ApiError } from './errors.js';

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const addressPart = z.string().max(300).nullable().default(null);

const placeSchema = z.object({
  latitude,
  longitude,
  label: z.string().trim().min(1).max(300),
  address: z
    .object({
      houseNumber: addressPart,
      road: addressPart,
      locality: addressPart,
      county: addressPart,
      state: addressPart,
      postcode: addressPart,
      country: addressPart,
      countryCode: addressPart,
    })
    .nullable()
    .default(null),
});

const PHOTO_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

type PhotoType = 'jpeg' | 'png' | 'webp';

/** The decoded file must start with its declared format's signature, so a renamed or corrupt file is caught here. */
function sniffPhoto(bytes: Uint8Array): PhotoType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => bytes[index] === byte)) return 'png';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

const photoSchema = z.string().refine((value) => {
  const match = PHOTO_DATA_URL.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  // The signature is in the first 12 bytes; decoding 16 base64 characters gives exactly that.
  const head = Buffer.from(match[2].slice(0, 16), 'base64');
  return sniffPhoto(head) === match[1];
});

const detailsSchema = z.string().max(DETAILS_MAX_LENGTH).default('');

const BAD_REQUEST_MESSAGE = "Something about that request didn't look right. Reload the page and try again.";
const BAD_PHOTO_MESSAGE = "That photo couldn't be read. Use a JPEG, PNG, or WebP image.";
const BAD_LOCATION_MESSAGE = "That spot isn't a valid map location. Pick the place on the map again.";
const DETAILS_TOO_LONG_MESSAGE = `Your note is too long. Keep it to ${DETAILS_MAX_LENGTH} characters or fewer.`;

/** Validates `POST /api/investigate`. Each part fails with its own code so the app can point at the right step. */
export function parseInvestigationRequest(body: unknown): InvestigationRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ApiError(400, BAD_REQUEST_MESSAGE, 'INVALID_REQUEST');
  }
  const input = body as Record<string, unknown>;

  const photo = photoSchema.safeParse(input.photoDataUrl);
  if (!photo.success) throw new ApiError(400, BAD_PHOTO_MESSAGE, 'INVALID_PHOTO');

  const location = placeSchema.safeParse(input.location);
  if (!location.success) throw new ApiError(400, BAD_LOCATION_MESSAGE, 'INVALID_LOCATION');

  const details = detailsSchema.safeParse(input.details);
  if (!details.success) {
    const message = typeof input.details === 'string' ? DETAILS_TOO_LONG_MESSAGE : BAD_REQUEST_MESSAGE;
    throw new ApiError(400, message, 'INVALID_REQUEST');
  }

  const place: Place = location.data;
  return { photoDataUrl: photo.data, location: place, details: details.data };
}

/** Query values arrive as strings; empty strings and things like `1e999` must not slip through as numbers. */
const decimal = z
  .string()
  .trim()
  .regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/)
  .transform(Number);

const coordinatesQuerySchema = z.object({
  lat: decimal.pipe(latitude),
  lon: decimal.pipe(longitude),
});

const searchQuerySchema = z.object({ q: z.string().trim().min(2).max(200) });

export function parseCoordinatesQuery(query: unknown): Coordinates {
  const result = coordinatesQuerySchema.safeParse(query);
  if (!result.success) throw new ApiError(400, BAD_LOCATION_MESSAGE, 'INVALID_LOCATION');
  return { latitude: result.data.lat, longitude: result.data.lon };
}

export function parseSearchQuery(query: unknown): string {
  const result = searchQuerySchema.safeParse(query);
  if (!result.success) {
    throw new ApiError(400, 'Type at least 2 characters (and at most 200) to search for an address.', 'INVALID_REQUEST');
  }
  return result.data.q;
}
