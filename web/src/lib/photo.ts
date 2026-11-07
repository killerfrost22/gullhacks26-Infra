import exifr from "exifr";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export interface PreparedPhoto {
  /** Resized JPEG; re-encoding through canvas also strips EXIF (device, timestamps, GPS). */
  blob: Blob;
  previewUrl: string;
  /** GPS read from the ORIGINAL file before stripping, if the camera recorded it. */
  gps: { lat: number; lng: number } | null;
}

async function readGps(file: File): Promise<PreparedPhoto["gps"]> {
  try {
    const gps = await exifr.gps(file);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      return { lat: gps.latitude, lng: gps.longitude };
    }
  } catch {
    // No/unsupported EXIF block: the photo simply has no embedded location.
  }
  return null;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_INPUT_BYTES) throw new Error("Image is larger than 25 MB.");

  const gps = await readGps(file);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Your browser can't read this image format. Try a JPEG or PNG (HEIC opens only in Safari).");
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encoded = Promise.withResolvers<Blob | null>();
  canvas.toBlob(encoded.resolve, "image/jpeg", JPEG_QUALITY);
  const blob = await encoded.promise;
  if (!blob) throw new Error("Couldn't process the image.");

  return { blob, previewUrl: URL.createObjectURL(blob), gps };
}

export function getDevicePosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  const { promise, resolve, reject } = Promise.withResolvers<{ lat: number; lng: number; accuracy: number }>();
  if (!("geolocation" in navigator)) {
    reject(new Error("This browser doesn't support location."));
    return promise;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
    (err) => {
      const messages: Record<number, string> = {
        [err.PERMISSION_DENIED]: "Location permission denied. Allow it in browser settings or drop a pin on the map.",
        [err.POSITION_UNAVAILABLE]: "Your location is unavailable. Drop a pin on the map instead.",
        [err.TIMEOUT]: "Getting your location timed out. Try again or drop a pin on the map.",
      };
      reject(new Error(messages[err.code] ?? err.message));
    },
    { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
  );
  return promise;
}
