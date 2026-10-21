import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ApiFailure, ApiSuccess } from '@career-prep/shared';

export function sendSuccess<T>(res: Response, data: T, message?: string, status = 200): void {
  const body: ApiSuccess<T> = message ? { success: true, data, message } : { success: true, data };
  res.status(status).json(body);
}

export function sendFailure(res: Response, failure: ApiFailure, status: number): void {
  res.status(status).json(failure);
}

/**
 * Wraps an async handler so a rejected promise reaches the central error
 * middleware instead of hanging the request.
 */
export function asyncHandler<
  Req extends Request = Request,
  Res extends Response = Response,
>(handler: (req: Req, res: Res, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req as unknown as Req, res as unknown as Res, next)).catch(next);
  };
}
