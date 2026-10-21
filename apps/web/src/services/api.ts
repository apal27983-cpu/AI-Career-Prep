import axios, { AxiosError, type AxiosInstance, type AxiosProgressEvent } from 'axios';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  type ApiErrorCode,
  type ApiResponse,
} from '@career-prep/shared';

/**
 * The browser talks only to our own backend. There is no provider key here and
 * no `VITE_` variable that could carry one - the only configurable value is the
 * API base path.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/** A normalised error every screen can render without inspecting Axios. */
export class ApiError extends Error {
  readonly code: ApiErrorCode | 'NETWORK_ERROR';
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(
    code: ApiErrorCode | 'NETWORK_ERROR',
    message: string,
    status: number,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** True for failures where retrying the same request makes sense. */
  get isRetryable(): boolean {
    return (
      this.code === 'NETWORK_ERROR' ||
      this.code === 'TIMEOUT' ||
      this.code === 'AI_UNAVAILABLE' ||
      this.code === 'AI_INVALID_RESPONSE' ||
      this.code === 'INTERNAL_ERROR'
    );
  }

  get isSessionExpired(): boolean {
    return this.code === 'UNAUTHENTICATED';
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  // Required so the httpOnly session cookie is sent.
  withCredentials: true,
  timeout: 180_000,
  headers: { 'Content-Type': 'application/json' },
});

/** In-memory copy of the CSRF token; the cookie is the durable source. */
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

http.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = csrfToken ?? readCookie(CSRF_COOKIE);
    if (token) config.headers.set(CSRF_HEADER, token);
  }
  return config;
});

/** Called when the API reports an expired session, so the app can redirect. */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiResponse<unknown>>;

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      return new ApiError('TIMEOUT', 'That request timed out. Please try again.', 0);
    }
    if (!axiosError.response) {
      return new ApiError(
        'NETWORK_ERROR',
        navigator.onLine
          ? 'We could not reach the server. Please try again.'
          : 'You appear to be offline. Check your connection and try again.',
        0,
      );
    }

    const body = axiosError.response.data;
    if (body && typeof body === 'object' && 'success' in body && body.success === false) {
      return new ApiError(
        body.error.code,
        body.error.message,
        axiosError.response.status,
        body.error.details,
      );
    }

    return new ApiError(
      'INTERNAL_ERROR',
      'Something went wrong. Please try again.',
      axiosError.response.status,
    );
  }

  return new ApiError('INTERNAL_ERROR', 'Something went wrong. Please try again.', 0);
}

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const apiError = toApiError(error);
    if (apiError.isSessionExpired) onSessionExpired?.();
    return Promise.reject(apiError);
  },
);

/** Unwraps the success envelope so callers work with `data` directly. */
export async function request<T>(
  promise: Promise<{ data: ApiResponse<T> }>,
): Promise<{ data: T; message?: string }> {
  const response = await promise;
  const body = response.data;

  if (!body.success) {
    const error = new ApiError(body.error.code, body.error.message, 200, body.error.details);
    // A failure envelope on a 2xx response would otherwise skip the interceptor.
    if (error.isSessionExpired) onSessionExpired?.();
    throw error;
  }
  return { data: body.data, message: body.message };
}

export type UploadProgressHandler = (percent: number) => void;

/** Axios progress events to a simple 0-100 percentage. */
export function progressHandler(onProgress?: UploadProgressHandler) {
  return (event: AxiosProgressEvent) => {
    if (!onProgress || !event.total) return;
    onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
  };
}
