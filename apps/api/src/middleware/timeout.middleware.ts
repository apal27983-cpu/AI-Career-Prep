import type { RequestHandler } from 'express';
import type { ApiFailure } from '@career-prep/shared';
import { logger } from '../utils/logger.js';

/**
 * Caps how long a request may stay open. AI-backed routes get a longer budget
 * than the rest, which is why this is a factory rather than a fixed value.
 */
export function requestTimeout(ms: number): RequestHandler {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (res.headersSent || res.writableEnded) return;
      logger.warn({ method: req.method, path: req.path, ms }, 'Request timed out');
      const body: ApiFailure = {
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'That took longer than expected. Please try again.',
        },
      };
      res.status(504).json(body);
    }, ms);

    const clear = () => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);
    next();
  };
}
