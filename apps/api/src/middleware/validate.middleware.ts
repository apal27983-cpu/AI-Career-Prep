import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError } from '../utils/errors.js';

/** Turns a Zod error into the `details` map the client renders beside each field. */
export function zodIssuesToDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

export function validationError(error: ZodError): AppError {
  return new AppError('VALIDATION_ERROR', 'Please check the submitted information.', {
    details: zodIssuesToDetails(error),
  });
}

/**
 * Replaces `req.body` with the parsed result, so handlers can only see values
 * that passed validation (and the coercions/trimming the schema applies).
 */
export function validateBody<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    req.body = result.data as unknown;
    next();
  };
}

export function validateParams<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    Object.assign(req.params, result.data as Record<string, string>);
    next();
  };
}

export function validateQuery<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    Object.assign(req.query, result.data as Record<string, unknown>);
    next();
  };
}

/** Type helper for handlers reading a validated body. */
export type Body<S extends ZodTypeAny> = z.infer<S>;
