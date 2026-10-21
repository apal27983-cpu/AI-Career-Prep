import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * Minimal .env loader. Keeps the API free of a dotenv dependency and makes the
 * precedence explicit: a real process environment variable always wins over the
 * file, which matters in production where secrets come from a secret manager.
 */
function loadEnvFile(): void {
  const candidates = [
    process.env.ENV_FILE,
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
  ].filter((value): value is string => Boolean(value));

  const found = candidates.find((file) => existsSync(file));
  if (!found) return;

  for (const rawLine of readFileSync(found, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile();

const booleanish = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return fallback;
      return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    });

const intWithDefault = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === '' ? fallback : Number(value)))
    .pipe(z.number().int().min(min).max(max));

/**
 * Default model per provider, used when LLM_MODEL is not set. Both were checked
 * against the structured-output path the app actually uses.
 */
const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-5.5',
  mock: 'curated-fallback',
};

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Generic port, which hosting platforms set for the service they run. */
    PORT: intWithDefault(4000, 1, 65535),
    /**
     * Explicit API port, used in preference to PORT when set. This exists
     * because a combined dev launcher (or a tool that starts the whole
     * workspace) sets PORT for the web server, and the API must not inherit it.
     */
    API_PORT: intWithDefault(0, 0, 65535),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    SESSION_SECRET: z
      .string()
      .min(32, 'SESSION_SECRET must be at least 32 characters')
      .refine(
        (value) => !value.includes('replace-with'),
        'SESSION_SECRET still holds the placeholder from .env.example',
      ),
    SESSION_TTL_DAYS: intWithDefault(7, 1, 90),
    /**
     * SameSite policy for the session cookie.
     *
     * "lax" is correct when the browser app and the API share a domain, which
     * is the default and the safer setting. A frontend deployed separately
     * from the API (for example Vercel + a Node host) is cross-site, and the
     * browser will not send a Lax cookie on those requests at all - that
     * deployment needs "none", which the browser only honours over HTTPS.
     */
    SESSION_COOKIE_SAMESITE: z.enum(['lax', 'none']).default('lax'),
    FRONTEND_URL: z.string().default('http://localhost:5173'),
    TRUST_PROXY: booleanish(false),

    LLM_PROVIDER: z.enum(['anthropic', 'openai', 'mock']).default('anthropic'),
    LLM_API_KEY: z.string().optional().default(''),
    /** Left empty to take the provider's own default; see DEFAULT_MODELS. */
    LLM_MODEL: z.string().default(''),
    LLM_MAX_OUTPUT_TOKENS: intWithDefault(8000, 1024, 64_000),
    LLM_TIMEOUT_MS: intWithDefault(90_000, 5_000, 300_000),
    LLM_MAX_RETRIES: intWithDefault(2, 0, 4),
    /** Thinking/token depth. Lower is cheaper and faster. */
    LLM_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
    /** Server-side refusal fallback. Disabled automatically if the account rejects the beta. */
    LLM_SERVER_FALLBACKS: booleanish(true),

    MAX_RESUME_SIZE_MB: intWithDefault(5, 1, 25),
    RESUME_STORAGE_DIR: z.string().default('./storage/resumes'),
    RESUME_STORAGE_MODE: z.enum(['memory', 'disk']).default('disk'),

    AUTH_RATE_LIMIT_MAX: intWithDefault(10, 1, 1000),
    AI_RATE_LIMIT_MAX: intWithDefault(30, 1, 1000),
    UPLOAD_RATE_LIMIT_MAX: intWithDefault(10, 1, 1000),
    RATE_LIMIT_WINDOW_MINUTES: intWithDefault(15, 1, 240),
    MAX_INTERVIEW_SESSIONS_PER_DAY: intWithDefault(20, 1, 500),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((value, ctx) => {
    // A missing key for a real provider is a configuration bug worth failing on.
    if (value.LLM_PROVIDER !== 'mock' && value.LLM_API_KEY.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LLM_API_KEY'],
        message: `LLM_API_KEY is required when LLM_PROVIDER is "${value.LLM_PROVIDER}". Set LLM_PROVIDER="mock" to run without an external provider.`,
      });
    }
    if (value.SESSION_COOKIE_SAMESITE === 'none' && value.NODE_ENV !== 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_COOKIE_SAMESITE'],
        message:
          'SameSite=None requires the Secure cookie flag, which this app only sets when NODE_ENV is "production". ' +
          'If you are deploying, set NODE_ENV="production" - do NOT switch to "lax", because a Lax cookie is not sent ' +
          'cross-site and every signed-in request would fail. For local development, "lax" is correct.',
      });
    }
    if (value.NODE_ENV === 'production' && value.LLM_PROVIDER === 'mock') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LLM_PROVIDER'],
        message: 'The mock provider is a development fallback and must not be used in production.',
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema> & {
  allowedOrigins: string[];
  maxResumeBytes: number;
  isProduction: boolean;
  isTest: boolean;
};

/**
 * Validates a raw environment and returns the derived config. Exported as a
 * pure function so the rules can be tested without reloading modules.
 */
export function parseEnv(source: NodeJS.ProcessEnv): AppEnv {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(
      `Invalid environment configuration.\n${lines.join('\n')}\n` +
        'Copy .env.example to .env and fill in the required values.',
    );
  }

  const value = parsed.data;
  return {
    ...value,
    // 0 means "not set", so PORT still wins in production.
    PORT: value.API_PORT > 0 ? value.API_PORT : value.PORT,
    LLM_MODEL: value.LLM_MODEL.trim() || (DEFAULT_MODELS[value.LLM_PROVIDER] ?? ''),
    allowedOrigins: value.FRONTEND_URL.split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
    maxResumeBytes: value.MAX_RESUME_SIZE_MB * 1024 * 1024,
    isProduction: value.NODE_ENV === 'production',
    isTest: value.NODE_ENV === 'test',
  };
}

let cached: AppEnv | null = null;

/** Validated configuration. Throws on first access if anything is missing. */
export function env(): AppEnv {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Test helper: forces the next `env()` call to re-read `process.env`. */
export function resetEnvCache(): void {
  cached = null;
}
