import { pino } from 'pino';
import { env } from '../config/env.js';

/**
 * Paths that must never reach a log line. Resume text, parsed resume data and
 * interview answers are personal information, and the auth/cookie headers are
 * credentials.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'password',
  'confirmPassword',
  'currentPassword',
  'newPassword',
  'confirmNewPassword',
  'passwordHash',
  'apiKey',
  'LLM_API_KEY',
  'SESSION_SECRET',
  'DATABASE_URL',
  'token',
  'tokenHash',
  'csrfSecret',
  'extractedText',
  'parsedData',
  'answerText',
  'resumeText',
  'jobDescription',
  '*.password',
  '*.extractedText',
  '*.answerText',
];

export const logger = pino({
  level: env().LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  base: { service: 'career-prep-api' },
  // Pretty output is intentionally not enabled: structured JSON keeps the
  // redaction rules reliable and is what hosting platforms expect.
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export type Logger = typeof logger;
