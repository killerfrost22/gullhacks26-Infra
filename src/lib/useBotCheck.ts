import { useCallback, useEffect, useRef } from 'react';
import 'altcha';
import type { AltchaWidgetElement } from 'altcha';

// The server issues proofs that expire after five minutes; refresh well before that.
const PROOF_LIFETIME_MS = 4 * 60_000;

interface Slot {
  startedAt: number;
  failed: boolean;
  token: Promise<string>;
}

/**
 * Invisible, self-hosted proof of work (ALTCHA). Solving starts as soon as the hook is enabled,
 * so a single-use proof is usually ready before the person taps submit.
 */
export function useBotCheck(enabled: boolean) {
  const widget = useRef<Promise<AltchaWidgetElement> | null>(null);
  const slot = useRef<Slot | null>(null);

  const start = useCallback((element: AltchaWidgetElement): Slot => {
    element.reset();
    const next: Slot = {
      startedAt: Date.now(),
      failed: false,
      token: element.verify().then((result) => {
        if (!result?.payload) throw new Error('The security check did not finish. Check your connection and try again.');
        return result.payload;
      }),
    };
    next.token.catch(() => { next.failed = true; });
    slot.current = next;
    return next;
  }, []);

  useEffect(() => {
    if (!enabled || !window.isSecureContext || !window.crypto?.subtle) return;
    const host = document.createElement('div');
    host.hidden = true;
    const element = document.createElement('altcha-widget');
    element.setAttribute('challenge', '/api/captcha/challenge');
    element.setAttribute('display', 'invisible');
    element.setAttribute('workers', '2');
    element.setAttribute('configuration', JSON.stringify({ auto: 'off', humanInteractionSignature: false, hideFooter: true, hideLogo: true, minDuration: 0 }));
    // The widget's methods exist only after it mounts and fires `load`.
    const loaded = new Promise<AltchaWidgetElement>((resolve) => {
      element.addEventListener('load', () => resolve(element), { once: true });
    });
    host.append(element);
    document.body.append(host);
    widget.current = loaded;
    void loaded.then((ready) => { if (widget.current === loaded) start(ready); });
    return () => {
      widget.current = null;
      slot.current = null;
      if (typeof element.reset === 'function') element.reset();
      host.remove();
    };
  }, [enabled, start]);

  /** Hands out a fresh single-use proof, solving now if the warm one is missing, stale, or failed. */
  const takeToken = useCallback(async (): Promise<string> => {
    if (!window.isSecureContext || !window.crypto?.subtle) {
      throw new Error('This page needs a secure (https) connection to send reports.');
    }
    const pending = widget.current;
    if (!pending) throw new Error('The security check is still loading. Try again in a moment.');
    const element = await pending;
    let current = slot.current;
    if (!current || current.failed || Date.now() - current.startedAt > PROOF_LIFETIME_MS) current = start(element);
    slot.current = null;
    return current.token;
  }, [start]);

  /** Starts solving the next proof in the background. */
  const warmUp = useCallback(() => {
    const pending = widget.current;
    void pending?.then((element) => { if (widget.current === pending && !slot.current) start(element); });
  }, [start]);

  return { takeToken, warmUp };
}
