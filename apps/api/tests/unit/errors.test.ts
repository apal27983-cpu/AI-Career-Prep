import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { API_ERROR_CODES, API_ERROR_STATUS } from '@career-prep/shared';
import { AppError, badRequest, notFound, unauthenticated } from '../../src/utils/errors.js';
import { zodIssuesToDetails } from '../../src/middleware/validate.middleware.js';
import { csrfTokenFor, csrfTokenMatches } from '../../src/services/session.service.js';

describe('AppError', () => {
  it('takes the HTTP status from the error code', () => {
    expect(new AppError('NOT_FOUND', 'x').status).toBe(404);
    expect(new AppError('RATE_LIMITED', 'x').status).toBe(429);
    expect(new AppError('AI_UNAVAILABLE', 'x').status).toBe(503);
  });

  it('has a status mapped for every code', () => {
    for (const code of API_ERROR_CODES) {
      expect(API_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it('keeps diagnostic context out of the user-facing message', () => {
    const error = new AppError('INTERNAL_ERROR', 'Something went wrong on our side.', {
      logContext: { connectionString: 'postgresql://user:secret@host/db' },
    });
    expect(error.message).not.toContain('secret');
    expect(error.logContext?.connectionString).toContain('secret');
  });

  it('returns 404 for a resource owned by somebody else, not 403', () => {
    // A 403 would confirm that another user's record exists.
    expect(notFound().status).toBe(404);
  });

  it('builds the common errors with the right codes', () => {
    expect(badRequest('x').code).toBe('VALIDATION_ERROR');
    expect(unauthenticated().code).toBe('UNAUTHENTICATED');
  });
});

describe('zodIssuesToDetails', () => {
  it('keys messages by field path', () => {
    const schema = z.object({
      email: z.string().email('Enter a valid email address'),
      age: z.number().int().min(18, 'Must be 18 or over'),
    });
    const result = schema.safeParse({ email: 'nope', age: 12 });
    expect(result.success).toBe(false);

    const details = zodIssuesToDetails(result.error!);
    expect(details.email).toEqual(['Enter a valid email address']);
    expect(details.age).toEqual(['Must be 18 or over']);
  });

  it('groups several messages for one field', () => {
    const schema = z.object({
      password: z
        .string()
        .min(10, 'Too short')
        .refine((value) => /[A-Z]/.test(value), 'Needs an uppercase letter'),
    });
    const result = schema.safeParse({ password: 'abc' });
    const details = zodIssuesToDetails(result.error!);
    expect(details.password).toHaveLength(2);
  });
});

describe('CSRF tokens', () => {
  it('accepts the token derived from the session secret', () => {
    const secret = 'a-session-bound-secret';
    expect(csrfTokenMatches(secret, csrfTokenFor(secret))).toBe(true);
  });

  it('rejects a token derived from a different secret', () => {
    expect(csrfTokenMatches('secret-a', csrfTokenFor('secret-b'))).toBe(false);
  });

  it('rejects a missing or malformed token', () => {
    const secret = 'a-session-bound-secret';
    expect(csrfTokenMatches(secret, undefined)).toBe(false);
    expect(csrfTokenMatches(secret, '')).toBe(false);
    expect(csrfTokenMatches(secret, 'short')).toBe(false);
  });
});
