import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Test environment.
 *
 * The root `.env` is loaded first so the integration suites can reach the same
 * PostgreSQL instance the app uses, without every developer having to export
 * TEST_DATABASE_URL by hand. A real process environment variable still wins, so
 * CI can override anything.
 *
 * The test-only overrides are applied AFTER that load and are unconditional:
 * whatever `.env` says, tests run against the mock LLM provider with no API key,
 * so no test can make a paid call or reach a real provider.
 */
function loadRootEnvFile(): void {
  const envFile = path.resolve(import.meta.dirname, '../../../.env');
  if (!existsSync(envFile)) return;

  for (const rawLine of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
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

loadRootEnvFile();

// Integration tests use their own database when one is configured, so a run
// cannot truncate development data.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/career_prep_test?schema=public';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? 'test-session-secret-that-is-long-enough-to-pass-validation';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
process.env.RESUME_STORAGE_MODE = 'memory';
process.env.RESUME_STORAGE_DIR = './tmp/test-storage';

// Not negotiable, and asserted below: no test talks to a paid provider.
process.env.LLM_PROVIDER = 'mock';
process.env.LLM_API_KEY = '';
process.env.LLM_MODEL = '';

if (process.env.LLM_PROVIDER !== 'mock' || process.env.LLM_API_KEY !== '') {
  throw new Error('Test setup failed to force the mock LLM provider; refusing to run.');
}
