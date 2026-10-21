import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { CSRF_COOKIE, SESSION_COOKIE } from '@career-prep/shared';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';

const TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions(maxAgeMs: number): CookieOptions {
  const config = env();
  return {
    httpOnly: true,
    // `lax` blocks cross-site requests and is right when the app and the API
    // share a domain. A split deployment has to opt into `none`, which the
    // browser only accepts alongside Secure - see SESSION_COOKIE_SAMESITE.
    sameSite: config.SESSION_COOKIE_SAMESITE,
    secure: config.isProduction,
    path: '/',
    maxAge: maxAgeMs,
  };
}

/**
 * The CSRF cookie is deliberately readable by JavaScript: the browser copies it
 * into the `x-csrf-token` header and the server checks that the header matches
 * the secret bound to the session (signed double-submit).
 */
function csrfCookieOptions(maxAgeMs: number): CookieOptions {
  const config = env();
  return {
    httpOnly: false,
    // Must match the session cookie, or the two stop travelling together.
    sameSite: config.SESSION_COOKIE_SAMESITE,
    secure: config.isProduction,
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function csrfTokenFor(csrfSecret: string): string {
  return createHmac('sha256', env().SESSION_SECRET).update(csrfSecret).digest('hex');
}

export function csrfTokenMatches(csrfSecret: string, candidate: string | undefined): boolean {
  if (!candidate) return false;
  const expected = Buffer.from(csrfTokenFor(csrfSecret), 'utf8');
  const provided = Buffer.from(candidate, 'utf8');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export interface IssuedSession {
  sessionId: string;
  csrfToken: string;
}

export async function createSession(
  res: Response,
  userId: string,
  userAgent: string | undefined,
): Promise<IssuedSession> {
  const config = env();
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const csrfSecret = randomBytes(TOKEN_BYTES).toString('base64url');
  const ttlMs = config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      csrfSecret,
      userAgent: userAgent?.slice(0, 400) ?? null,
      expiresAt: new Date(Date.now() + ttlMs),
    },
    select: { id: true },
  });

  const csrfToken = csrfTokenFor(csrfSecret);
  res.cookie(SESSION_COOKIE, token, cookieOptions(ttlMs));
  res.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions(ttlMs));

  return { sessionId: session.id, csrfToken };
}

export interface ResolvedSession {
  user: { id: string; name: string; email: string; createdAt: Date };
  session: { id: string; csrfSecret: string; expiresAt: Date };
}

/** Looks the session up by cookie and drops it if it has expired. */
export async function resolveSession(req: Request): Promise<ResolvedSession | null> {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (typeof raw !== 'string' || raw.length < 16) return null;

  const record = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(raw) },
    select: {
      id: true,
      csrfSecret: true,
      expiresAt: true,
      user: { select: { id: true, name: true, email: true, createdAt: true } },
    },
  });

  if (!record) return null;

  if (record.expiresAt.getTime() <= Date.now()) {
    await prisma.authSession.delete({ where: { id: record.id } }).catch(() => undefined);
    return null;
  }

  return {
    user: record.user,
    session: { id: record.id, csrfSecret: record.csrfSecret, expiresAt: record.expiresAt },
  };
}

export async function touchSession(sessionId: string): Promise<void> {
  await prisma.authSession
    .update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(0), maxAge: undefined });
  res.clearCookie(CSRF_COOKIE, { ...csrfCookieOptions(0), maxAge: undefined });
}

export async function destroySession(res: Response, sessionId: string | undefined): Promise<void> {
  if (sessionId) {
    await prisma.authSession.delete({ where: { id: sessionId } }).catch(() => undefined);
  }
  clearSessionCookies(res);
}

/** Invalidates every session for a user, e.g. after a password change. */
export async function destroyAllSessionsForUser(userId: string): Promise<number> {
  const result = await prisma.authSession.deleteMany({ where: { userId } });
  return result.count;
}

export async function purgeExpiredSessions(): Promise<number> {
  const result = await prisma.authSession.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return result.count;
}
