import type { ApiErrorBody, ApiErrorCode } from '../shared/types.js';

/** An error whose message is safe to show the user. The HTTP layer turns it into `{ error, code }`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, message: string, code: ApiErrorCode) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  toBody(): ApiErrorBody {
    return { error: this.message, code: this.code };
  }
}
