import type { Coordinates } from '../../shared/types';

export type LocateErrorCode = 'INSECURE' | 'UNSUPPORTED' | 'DENIED' | 'TIMEOUT' | 'UNAVAILABLE';

const LOCATE_ERROR_MESSAGES: Record<LocateErrorCode, string> = {
  INSECURE: 'Your location only works over a secure (https) connection. Search for the address or tap the map instead.',
  UNSUPPORTED: "This browser can't share your location. Search for the address or tap the map instead.",
  DENIED: 'Location access is off for this site. Allow it in your browser settings, or search for the address instead.',
  TIMEOUT: 'Finding your location took too long. Try again, or search for the address.',
  UNAVAILABLE: "Your device couldn't find its location. Try again, or search for the address.",
};

export class LocateError extends Error {
  readonly code: LocateErrorCode;

  constructor(code: LocateErrorCode) {
    super(LOCATE_ERROR_MESSAGES[code]);
    this.name = 'LocateError';
    this.code = code;
  }
}

/**
 * Asks the device where it is. Rejects with `LocateError`, or with an `AbortError` DOMException
 * when `signal` aborts (the browser can't cancel the lookup, so its late answer is ignored).
 */
export function locateDevice(signal?: AbortSignal): Promise<{ point: Coordinates; accuracyMeters: number }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Location request cancelled.', 'AbortError'));
      return;
    }
    if (globalThis.isSecureContext === false) {
      reject(new LocateError('INSECURE'));
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new LocateError('UNSUPPORTED'));
      return;
    }
    let settled = false;
    const onAbort = () => {
      settled = true;
      reject(new DOMException('Location request cancelled.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        resolve({
          point: { latitude: position.coords.latitude, longitude: position.coords.longitude },
          accuracyMeters: position.coords.accuracy,
        });
      },
      (error) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        const code: LocateErrorCode =
          error.code === error.PERMISSION_DENIED ? 'DENIED' : error.code === error.TIMEOUT ? 'TIMEOUT' : 'UNAVAILABLE';
        reject(new LocateError(code));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  });
}
