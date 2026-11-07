import type { CaptchaWorkerReply } from './captcha.worker';
import { CaptchaSolveError } from './captcha-solve';

/** Turns a challenge from GET /api/captcha/challenge into the X-Captcha-Token value. */
export type CaptchaSolver = (challenge: unknown, signal?: AbortSignal) => Promise<string>;

function abortError(): DOMException {
  return new DOMException('The bot check was cancelled.', 'AbortError');
}

/** Solves off the main thread so the page keeps responding while the proof of work runs. */
export const solveCaptchaInWorker: CaptchaSolver = (challenge, signal) =>
  new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const worker = new Worker(new URL('./captcha.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      finish();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.addEventListener('message', (event: MessageEvent<CaptchaWorkerReply>) => {
      finish();
      const reply = event.data;
      if ('payload' in reply) resolve(reply.payload);
      else reject(new CaptchaSolveError(reply.error));
    });
    worker.addEventListener('error', () => {
      finish();
      reject(new CaptchaSolveError('The bot check could not start.'));
    });
    worker.postMessage(challenge);
  });
