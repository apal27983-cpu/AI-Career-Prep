import type { NextFunction, Request, Response } from 'express';
import { CSRF_HEADER } from '@career-prep/shared';
import { AppError, unauthenticated } from '../utils/errors.js';
import { csrfTokenMatches, resolveSession, touchSession } from '../services/session.service.js';

/**
 * Attaches the authenticated user from the session cookie. Every protected
 * handler relies on this and on nothing the client can set.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const resolved = await resolveSession(req);
    if (!resolved) {
      next(unauthenticated('Your session has expired. Please sign in again.'));
      return;
    }

    req.authUser = resolved.user;
    req.authSession = resolved.session;
    void touchSession(resolved.session.id);
    next();
  } catch (error) {
    next(error);
  }
}

/** Convenience accessor that narrows the optional request fields. */
export function currentUser(req: Request): { id: string; name: string; email: string } {
  if (!req.authUser) {
    // Reaching this means a route was mounted without requireAuth.
    throw unauthenticated();
  }
  return req.authUser;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Signed double-submit CSRF check. Required because authentication rides on a
 * cookie: without it, another site could trigger state-changing requests.
 */
export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const secret = req.authSession?.csrfSecret;
  if (!secret) {
    next(unauthenticated('Your session has expired. Please sign in again.'));
    return;
  }

  const header = req.get(CSRF_HEADER);
  if (!csrfTokenMatches(secret, header ?? undefined)) {
    next(
      new AppError(
        'CSRF_TOKEN_INVALID',
        'Your request could not be verified. Please refresh the page and try again.',
      ),
    );
    return;
  }

  next();
}
