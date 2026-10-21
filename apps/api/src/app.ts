import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { generalLimiter } from './middleware/rateLimit.middleware.js';
import { databaseReachable } from './config/prisma.js';
import { sendSuccess } from './utils/http.js';

export function createApp(): Express {
  const config = env();
  const app = express();

  // Needed for correct client IPs (rate limiting) behind a hosting proxy.
  if (config.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; a strict CSP here costs nothing and stops a
      // stray HTML error page from executing anything.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.use(
    cors({
      // Explicit allowlist. `credentials` is required for the session cookie,
      // which is exactly why the origin cannot be reflected blindly.
      origin: (origin, callback) => {
        if (!origin) {
          // Same-origin or non-browser client (curl, health checks).
          callback(null, true);
          return;
        }
        const normalised = origin.replace(/\/$/, '');
        if (config.allowedOrigins.includes(normalised)) {
          callback(null, true);
          return;
        }
        logger.warn({ origin }, 'Blocked a request from a disallowed origin');
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
      maxAge: 600,
    }),
  );

  app.use(
    pinoHttp({
      logger,
      // Health checks would otherwise dominate the log.
      autoLogging: { ignore: (req) => req.url === '/health' },
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // Body size caps. Uploads are handled by multer, not by these parsers.
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(cookieParser());
  app.use(generalLimiter);

  app.get('/health', (_req, res) => {
    void databaseReachable().then((database) => {
      sendSuccess(res, {
        status: database ? 'ok' : 'degraded',
        database,
        provider: config.LLM_PROVIDER,
        environment: config.NODE_ENV,
      });
    });
  });

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
