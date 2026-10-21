import type { AuthenticatedUser } from '@career-prep/shared';
import { conflict, unauthenticated } from '../utils/errors.js';
import {
  createUser,
  findUserByEmail,
  findUserWithPasswordById,
  updatePasswordHash,
  userHasProfile,
} from '../repositories/user.repository.js';
import { dummyVerify, hashPassword, verifyPassword } from './password.service.js';

export interface AuthUserRecord {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export async function toAuthenticatedUser(user: AuthUserRecord): Promise<AuthenticatedUser> {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    hasProfile: await userHasProfile(user.id),
  };
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthUserRecord> {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    // The email is one the user typed themselves, so saying it is taken here is
    // not an enumeration leak the registration form does not already have.
    throw conflict('An account already exists for that email address.');
  }

  const passwordHash = await hashPassword(input.password);
  return createUser({ name: input.name, email: input.email, passwordHash });
}

export async function authenticate(email: string, password: string): Promise<AuthUserRecord> {
  const user = await findUserByEmail(email);

  if (!user) {
    await dummyVerify();
    throw unauthenticated('Those credentials did not match our records.');
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    throw unauthenticated('Those credentials did not match our records.');
  }

  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await findUserWithPasswordById(userId);
  if (!user) throw unauthenticated();

  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) {
    throw unauthenticated('Your current password is not correct.');
  }

  await updatePasswordHash(userId, await hashPassword(newPassword));
}
