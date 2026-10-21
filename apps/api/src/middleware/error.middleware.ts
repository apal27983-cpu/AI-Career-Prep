import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { API_ERROR_STATUS, type ApiFailure } from '@career-prep/shared';
import { AppError, isAppError } from '../utils/errors.js';
import { zodIssuesToDetails } from './validate.middleware.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/** Maps infrastructure errors onto the app's own error vocabulary. */
function normalise(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (error instanceof ZodError) {
    return new AppError('VALIDATION_ERROR', 'Please check the submitted information.', {
      details: zodIssuesToDetails(error),
    });
  }

  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new AppError(
        'PAYLOAD_TOO_LARGE',
        `That file is larger than the ${env().MAX_RESUME_SIZE_MB} MB limit.`,
      );
    }
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return new AppError('VALIDATION_ERROR', 'Upload exactly one resume file.');
    }
    return new AppError('VALIDATION_ERROR', 'That upload could not be accepted.', {
      logContext: { multerCode: error.code },
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return new AppError('CONFLICT', 'That value is already in use.', {
        logContext: { prismaCode: error.code },
      });
    }
    if (error.code === 'P2025') {
      return new AppError('NOT_FOUND', 'We could not find what you were looking for.');
    }
    return new AppError('INTERNAL_ERROR', 'Something went wrong on our side. Please try again.', {
      logContext: { prismaCode: error.code },
      cause: error,
    });
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return new AppError('INTERNAL_ERROR', 'The service is temporarily unavailable. Please try again.', {
      logContext: { reason: 'database_unavailable' },
      cause: error,
    });
  }

  // JSON body parser failures surface as a SyntaxError with a status.
  if (error instanceof SyntaxError && 'body' in error) {
    return new AppError('VALIDATION_ERROR', 'The request body was not valid JSON.');
  }

  return new AppError('INTERNAL_ERROR', 'Something went wrong on our side. Please try again.', {
    cause: error,
  });
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `No route matches ${req.method} ${req.path}.`));
};

/**
 * Single exit point for errors. The client gets a code and a safe message; the
 * stack and any provider payload stay in the server log.
 */
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = normalise(error);
  const status = appError.status || API_ERROR_STATUS.INTERNAL_ERROR;

  const logPayload = {
    code: appError.code,
    status,
    method: req.method,
    path: req.path,
    userId: req.authUser?.id,
    ...appError.logContext,
  };

  if (status >= 500) {
    logger.error({ ...logPayload, err: appError.cause ?? appError }, appError.message);
  } else {
    logger.warn(logPayload, appError.message);
  }

  const body: ApiFailure = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
    },
  };

  res.status(status).json(body);
};
