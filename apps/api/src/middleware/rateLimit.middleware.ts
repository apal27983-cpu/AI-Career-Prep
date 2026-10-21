import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import type { ApiFailure } from '@career-prep/shared';
import { env } from '../config/env.js';

const failure = (message: string): ApiFailure => ({
  success: false,
  error: { code: 'RATE_LIMITED', message },
});

/** Authenticated requests are limited per user; anonymous ones per IP. */
function keyFor(req: Request): string {
  return req.authUser?.id ?? req.ip ?? 'unknown';
}

function build(max: number, message: string, extra: Partial<Options> = {}) {
  return rateLimit({
    windowMs: env().RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyFor,
    // Limits exist to protect the service, not to fail the test suite.
    skip: () => env().isTest,
    handler: (_req, res) => {
      res.status(429).json(failure(message));
    },
    ...extra,
  });
}

/** Login and registration: slows credential stuffing down. */
export const authLimiter = build(
  env().AUTH_RATE_LIMIT_MAX,
  'Too many attempts. Please wait a few minutes and try again.',
  { keyGenerator: (req: Request) => req.ip ?? 'unknown', skipSuccessfulRequests: true },
);

/** Everything that costs an LLM call. */
export const aiLimiter = build(
  env().AI_RATE_LIMIT_MAX,
  'You have reached the AI request limit for now. Please try again shortly.',
);

export const uploadLimiter = build(
  env().UPLOAD_RATE_LIMIT_MAX,
  'Too many uploads in a short time. Please wait a few minutes.',
);

/** Backstop for everything else. */
export const generalLimiter = build(
  600,
  'Too many requests. Please slow down and try again shortly.',
);
