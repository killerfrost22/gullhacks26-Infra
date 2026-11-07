import { solveCaptcha } from './captcha-solve';

export type CaptchaWorkerReply = { payload: string } | { error: string };

// One challenge per worker: the caller terminates the worker when it is done or cancelled.
self.addEventListener('message', (event: MessageEvent<unknown>) => {
  solveCaptcha(event.data).then(
    (payload) => self.postMessage({ payload } satisfies CaptchaWorkerReply),
    (error: unknown) =>
      self.postMessage({ error: error instanceof Error ? error.message : 'Bot check failed.' } satisfies CaptchaWorkerReply),
  );
});
