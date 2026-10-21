/** Shape of every API response. The client never has to guess. */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiFailure {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field level validation messages, keyed by dot-path. */
    details?: Record<string, string[]>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'USAGE_LIMIT_REACHED',
  'CSRF_TOKEN_INVALID',
  'AI_UNAVAILABLE',
  'AI_INVALID_RESPONSE',
  'RESUME_PARSE_FAILED',
  'TIMEOUT',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** HTTP status used for each error code. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  USAGE_LIMIT_REACHED: 429,
  CSRF_TOKEN_INVALID: 403,
  AI_UNAVAILABLE: 503,
  AI_INVALID_RESPONSE: 502,
  RESUME_PARSE_FAILED: 422,
  TIMEOUT: 504,
  INTERNAL_ERROR: 500,
};

export const CSRF_HEADER = 'x-csrf-token';
export const CSRF_COOKIE = 'career_prep_csrf';
export const SESSION_COOKIE = 'career_prep_session';
