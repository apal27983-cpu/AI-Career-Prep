import { API_ERROR_STATUS, type ApiErrorCode } from '@career-prep/shared';

/**
 * The only error type route handlers should throw. `message` is written for the
 * end user; anything diagnostic goes in `logContext`, which never leaves the server.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, string[]>;
  readonly logContext?: Record<string, unknown>;
  readonly expose = true;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: {
      details?: Record<string, string[]>;
      logContext?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = API_ERROR_STATUS[code];
    this.details = options.details;
    this.logContext = options.logContext;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export const badRequest = (message: string, details?: Record<string, string[]>) =>
  new AppError('VALIDATION_ERROR', message, { details });

export const unauthenticated = (message = 'Please sign in to continue.') =>
  new AppError('UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError('FORBIDDEN', message);

/**
 * Used for resources that exist but belong to somebody else as well as for
 * resources that do not exist. Returning 404 either way means the API does not
 * confirm that another user's record exists.
 */
export const notFound = (message = 'We could not find what you were looking for.') =>
  new AppError('NOT_FOUND', message);

export const conflict = (message: string) => new AppError('CONFLICT', message);

export const internal = (message = 'Something went wrong on our side. Please try again.') =>
  new AppError('INTERNAL_ERROR', message);

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
