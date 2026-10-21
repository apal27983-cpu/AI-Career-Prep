import type { Request, Response } from 'express';
import type { ChangePasswordInput, LoginInput, RegisterInput } from '@career-prep/shared';
import { sendSuccess } from '../utils/http.js';
import { currentUser } from '../middleware/auth.middleware.js';
import {
  authenticate,
  changePassword,
  registerUser,
  toAuthenticatedUser,
} from '../services/auth.service.js';
import {
  createSession,
  csrfTokenFor,
  destroyAllSessionsForUser,
  destroySession,
} from '../services/session.service.js';
import { findUserById, deleteUser } from '../repositories/user.repository.js';
import { deleteAllResumeFilesForUser } from '../services/resumeStorage.service.js';
import { unauthenticated } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export async function register(req: Request, res: Response): Promise<void> {
  const body = req.body as RegisterInput;
  const user = await registerUser({ name: body.name, email: body.email, password: body.password });
  const { csrfToken } = await createSession(res, user.id, req.get('user-agent') ?? undefined);

  logger.info({ userId: user.id }, 'User registered');
  sendSuccess(
    res,
    { user: await toAuthenticatedUser(user), csrfToken },
    'Your account is ready. Next, complete your career profile.',
    201,
  );
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginInput;
  const user = await authenticate(body.email, body.password);
  const { csrfToken } = await createSession(res, user.id, req.get('user-agent') ?? undefined);

  logger.info({ userId: user.id }, 'User signed in');
  sendSuccess(res, { user: await toAuthenticatedUser(user), csrfToken }, 'Welcome back.');
}

export async function logout(req: Request, res: Response): Promise<void> {
  await destroySession(res, req.authSession?.id);
  sendSuccess(res, { loggedOut: true }, 'You have been signed out.');
}

export async function me(req: Request, res: Response): Promise<void> {
  const { id } = currentUser(req);
  const user = await findUserById(id);
  if (!user) throw unauthenticated();

  // Returned so a page reload can re-arm the CSRF header without a fresh login.
  const csrfToken = req.authSession ? csrfTokenFor(req.authSession.csrfSecret) : null;
  sendSuccess(res, { user: await toAuthenticatedUser(user), csrfToken });
}

export async function updatePassword(req: Request, res: Response): Promise<void> {
  const body = req.body as ChangePasswordInput;
  const { id } = currentUser(req);

  await changePassword(id, body.currentPassword, body.newPassword);
  // Every other device is signed out; the current one gets a fresh session.
  await destroyAllSessionsForUser(id);
  const { csrfToken } = await createSession(res, id, req.get('user-agent') ?? undefined);

  logger.info({ userId: id }, 'Password changed');
  sendSuccess(res, { csrfToken }, 'Your password has been updated on all devices.');
}

/** Deletes the account, every record that cascades from it, and the stored files. */
export async function deleteAccount(req: Request, res: Response): Promise<void> {
  const { id } = currentUser(req);

  await deleteAllResumeFilesForUser(id);
  await deleteUser(id);
  await destroySession(res, req.authSession?.id);

  logger.info({ userId: id }, 'Account deleted');
  sendSuccess(res, { deleted: true }, 'Your account and all associated data have been deleted.');
}
