import { hash, verify } from '@node-rs/argon2';

/** `Algorithm.Argon2id`, inlined because it is an ambient const enum. */
const ARGON2ID = 2;

/**
 * Argon2id with OWASP's recommended baseline (19 MiB, 2 iterations, 1 lane).
 */
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/**
 * Returns false rather than throwing on a malformed stored hash, so a corrupt
 * row cannot turn a failed login into a 500.
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

/**
 * Burns comparable CPU time when the email does not exist, so response timing
 * does not reveal which accounts are registered.
 */
export async function dummyVerify(): Promise<void> {
  const placeholder =
    '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$YQ1u3vsPjVKfLlPEJ7q0mJmlAW5CbR+qJQ2vJiY0PBc';
  try {
    await verify(placeholder, 'timing-equaliser');
  } catch {
    // Expected: the placeholder hash does not match. The cost is the point.
  }
}
