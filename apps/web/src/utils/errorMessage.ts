import { ApiError } from '../services/api';

/**
 * The message to put in front of the user for any failure.
 *
 * `ApiError.message` is already written for the end user by the backend, so it
 * is used as-is. Anything else falls back to a generic line rather than leaking
 * an internal message, and a session expiry is never surfaced as an error toast
 * because the app is already redirecting to sign-in.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

/** Session expiry is handled by a redirect, so it should not also raise a toast. */
export function shouldToast(error: unknown): boolean {
  return !(error instanceof ApiError && error.isSessionExpired);
}
