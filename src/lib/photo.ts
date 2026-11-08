import type { Coordinates } from '../../shared/types';

/** Larger files are refused before decoding, so a huge image can't stall or crash a phone. */
export const PHOTO_MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_EDGE = 1920;
const MIN_EDGE = 480;
// The request body limit is 6 MiB; this leaves room for the pin and the note.
const MAX_DATA_URL_LENGTH = 5.5 * 1024 * 1024;
const QUALITIES = [0.85, 0.75, 0.65, 0.5];
const DATA_URL_PREFIX = 'data:image/jpeg;base64,';

export interface PreparedPhoto {
  /** `data:image/jpeg;base64,...`, no metadata. */
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  fileName: string;
  /** GPS from the original file's metadata, only to suggest a pin. */
  gps: Coordinates | null;
}

export type PhotoErrorCode = 'UNSUPPORTED' | 'HEIC' | 'TOO_LARGE' | 'UNREADABLE';

// The Settings path uses no-break spaces so it wraps as one unit instead of splitting across lines.
const PHOTO_ERROR_MESSAGES: Record<PhotoErrorCode, string> = {
  UNSUPPORTED: 'That file isn’t a photo we can use. Choose a JPEG, PNG, WebP, or HEIC image.',
  HEIC: 'We couldn’t open that HEIC photo. Try another one, or on iPhone set Settings\u00a0›\u00a0Camera\u00a0›\u00a0Formats to Most\u00a0Compatible.',
  TOO_LARGE: 'That photo is over 15 MB. Choose a smaller one.',
  UNREADABLE: 'We couldn’t open that photo. Try another one.',
};

export class PhotoError extends Error {
  readonly code: PhotoErrorCode;

  constructor(code: PhotoErrorCode) {
    super(PHOTO_ERROR_MESSAGES[code]);
    this.name = 'PhotoError';
    this.code = code;
  }
}

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

type ImageType = 'jpeg' | 'png' | 'webp' | 'heic';

/** Identifies the image format from its first bytes; the file name and MIME type can't be trusted. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) {
    return 'png';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    // Major brand, then compatible brands, up to the end of the ftyp box (or what we read of it).
    const boxEnd = Math.min(bytes.length, new DataView(bytes.buffer, bytes.byteOffset).getUint32(0));
    const brands = [ascii(bytes, 8, 12)];
    for (let offset = 16; offset + 4 <= boxEnd; offset += 4) brands.push(ascii(bytes, offset, offset + 4));
    // AVIF shares the HEIF container (and often the mif1 brand) but isn't HEIC.
    if (brands.some((brand) => AVIF_BRANDS.has(brand))) return null;
    if (brands.some((brand) => HEIF_BRANDS.has(brand))) return 'heic';
  }
  return null;
}

async function readGps(file: File): Promise<Coordinates | null> {
  try {
    // Loaded on demand: metadata parsing must stay out of the first-load JS budget.
    const { gps } = await import('exifr');
    const result = await gps(file);
    const latitude = result?.latitude;
    const longitude = result?.longitude;
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180 ||
      // Some cameras write 0,0 when they have no fix.
      (latitude === 0 && longitude === 0)
    ) {
      return null;
    }
    return { latitude, longitude };
  } catch {
    return null;
  }
}

function photoFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `fixplease-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.jpg`;
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new PhotoError('UNREADABLE'))), 'image/jpeg', quality);
  });
}

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new PhotoError('UNREADABLE'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Decodes the photo upright. Safari reads HEIC itself; other browsers fetch a HEIC decoder (libheif in a Web Worker,
 * about 0.8 MB gzip) only when someone actually picks a HEIC photo, so it never counts against the first load.
 */
async function decodePhoto(file: File, type: ImageType): Promise<ImageBitmap> {
  try {
    // Applies the EXIF orientation while decoding, so the photo stays upright once the metadata is gone.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    if (type !== 'heic') throw new PhotoError('UNREADABLE');
  }
  try {
    // Dynamic on purpose: the decoder is ~0.8 MB gzip and must stay out of the 160 kB first-load JS budget.
    const { heicTo } = await import('heic-to');
    // libheif applies the HEIF rotation and mirror boxes itself, so this bitmap is upright too.
    return await heicTo({ blob: file, type: 'bitmap' });
  } catch {
    throw new PhotoError('HEIC');
  }
}

/**
 * Shrinks the photo to at most 1920 px on the long edge and re-encodes it as JPEG, which drops
 * EXIF/GPS and every other metadata block. GPS is read from the original first, only to suggest a pin.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.size > PHOTO_MAX_INPUT_BYTES) throw new PhotoError('TOO_LARGE');
  const type = sniffImageType(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  if (type === null) throw new PhotoError('UNSUPPORTED');

  const gps = readGps(file);
  const bitmap = await decodePhoto(file, type);

  const canvas = document.createElement('canvas');
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new PhotoError('UNREADABLE');
    let edge = Math.min(MAX_EDGE, Math.max(bitmap.width, bitmap.height));
    while (true) {
      const scale = edge / Math.max(bitmap.width, bitmap.height);
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      // JPEG has no transparency; without a fill, transparent PNG areas turn black.
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of QUALITIES) {
        const blob = await encodeJpeg(canvas, quality);
        if (DATA_URL_PREFIX.length + Math.ceil(blob.size / 3) * 4 <= MAX_DATA_URL_LENGTH) {
          return {
            dataUrl: await readDataUrl(blob),
            blob,
            width: canvas.width,
            height: canvas.height,
            fileName: photoFileName(new Date()),
            gps: await gps,
          };
        }
      }
      if (edge <= MIN_EDGE) throw new PhotoError('TOO_LARGE');
      edge = Math.max(MIN_EDGE, Math.round(edge * 0.75));
    }
  } finally {
    bitmap.close();
    // Frees the backing store right away; mobile Safari caps total canvas memory.
    canvas.width = 0;
    canvas.height = 0;
  }
}
