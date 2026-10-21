import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const webSrc = path.join(repoRoot, 'apps/web/src');
const webDist = path.join(repoRoot, 'apps/web/dist');

function walk(dir: string, extensions: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, extensions));
    } else if (extensions.includes(path.extname(full))) {
      out.push(full);
    }
  }
  return out;
}

describe('the LLM key never reaches the browser', () => {
  const sourceFiles = walk(webSrc, ['.ts', '.tsx']);

  it('finds frontend source files to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(10);
  });

  it('has no VITE_-prefixed secret in the frontend source', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const content = readFileSync(file, 'utf8');
      // Any VITE_ variable whose name suggests a credential.
      const matches = content.match(/VITE_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)[A-Z0-9_]*/g);
      if (matches) offenders.push(`${path.relative(repoRoot, file)}: ${matches.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('never reads a server-side variable from the frontend', () => {
    const forbidden = [
      'LLM_API_KEY',
      'SESSION_SECRET',
      'DATABASE_URL',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'process.env.LLM',
    ];
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const content = readFileSync(file, 'utf8');
      for (const needle of forbidden) {
        if (content.includes(needle)) {
          offenders.push(`${path.relative(repoRoot, file)}: ${needle}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('does not import a provider SDK into the frontend', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const content = readFileSync(file, 'utf8');
      if (/@anthropic-ai\/sdk|openai|from ['"]axios['"].*anthropic\.com/.test(content)) {
        offenders.push(path.relative(repoRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has no provider key or secret in the built bundle', () => {
    const assets = walk(webDist, ['.js', '.css', '.html']);
    if (assets.length === 0) {
      // Nothing to scan until `npm run build` has produced a bundle. The source
      // checks above already cover the common ways a key would get in.
      console.warn('No built frontend bundle found - run "npm run build" to include this check.');
      return;
    }

    const patterns = [
      /sk-ant-[A-Za-z0-9_-]{10,}/,
      /sk-proj-[A-Za-z0-9_-]{10,}/,
      /sk-[A-Za-z0-9]{20,}/,
      /\bLLM_API_KEY\b/,
      /\bSESSION_SECRET\b/,
      /postgresql:\/\/[^\s"']+/,
      /\bANTHROPIC_API_KEY\b/,
      /\bOPENAI_API_KEY\b/,
    ];

    const offenders: string[] = [];
    for (const asset of assets) {
      const content = readFileSync(asset, 'utf8');
      for (const pattern of patterns) {
        const match = pattern.exec(content);
        if (match) offenders.push(`${path.relative(repoRoot, asset)}: ${match[0].slice(0, 24)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps .env out of version control', () => {
    const gitignore = readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
  });

  it('ships no real secret in .env.example', () => {
    const example = readFileSync(path.join(repoRoot, '.env.example'), 'utf8');
    expect(example).not.toMatch(/sk-ant-[A-Za-z0-9_-]{10,}/);
    expect(example).not.toMatch(/sk-proj-[A-Za-z0-9_-]{10,}/);
    expect(example).toMatch(/LLM_API_KEY="replace-with/);
    expect(example).toMatch(/SESSION_SECRET="replace-with/);
    // The server key must never be exposed through a Vite variable.
    expect(example).not.toMatch(/VITE_LLM/);
  });

  it('keeps the real .env out of the frontend build inputs', () => {
    // A key in .env is fine; a key reachable from apps/web is not. The source
    // and bundle scans above are what enforce that, so this only guards the
    // one mistake they could not see: .env being copied into the web app.
    for (const stray of ['apps/web/.env', 'apps/web/public/.env', 'apps/web/src/.env']) {
      expect(existsSync(path.join(repoRoot, stray)), stray).toBe(false);
    }
  });
});

describe('environment validation', () => {
  const valid = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/career_prep',
    SESSION_SECRET: 'a-real-secret-that-is-at-least-32-characters-long',
    LLM_PROVIDER: 'mock',
    LLM_API_KEY: '',
  } satisfies NodeJS.ProcessEnv;

  it('accepts a complete configuration', () => {
    const config = parseEnv({ ...valid });
    expect(config.PORT).toBe(4000);
    expect(config.maxResumeBytes).toBe(5 * 1024 * 1024);
    expect(config.allowedOrigins).toEqual(['http://localhost:5173']);
  });

  it('refuses to start without a database URL', () => {
    const { DATABASE_URL: _omitted, ...withoutDatabase } = valid;
    expect(() => parseEnv(withoutDatabase)).toThrow(/DATABASE_URL/);
  });

  it('refuses a session secret that is too short', () => {
    expect(() => parseEnv({ ...valid, SESSION_SECRET: 'tooshort' })).toThrow(/SESSION_SECRET/);
  });

  it('refuses the placeholder session secret from .env.example', () => {
    expect(() =>
      parseEnv({
        ...valid,
        SESSION_SECRET: 'replace-with-a-long-random-secret-at-least-32-characters',
      }),
    ).toThrow(/SESSION_SECRET/);
  });

  it.each(['anthropic', 'openai'])('requires an API key for the %s provider', (provider) => {
    expect(() => parseEnv({ ...valid, LLM_PROVIDER: provider, LLM_API_KEY: '' })).toThrow(
      /LLM_API_KEY/,
    );
  });

  it('rejects an unknown provider rather than falling back silently', () => {
    expect(() => parseEnv({ ...valid, LLM_PROVIDER: 'definitely-not-a-provider' })).toThrow();
  });

  it('picks the right default model per provider', () => {
    const anthropic = parseEnv({ ...valid, LLM_PROVIDER: 'anthropic', LLM_API_KEY: 'k' });
    const openai = parseEnv({ ...valid, LLM_PROVIDER: 'openai', LLM_API_KEY: 'k' });

    expect(anthropic.LLM_MODEL).toBe('claude-opus-5-5');
    expect(openai.LLM_MODEL).toBe('gpt-5.5');
  });

  it('lets an explicit model override the provider default', () => {
    const config = parseEnv({
      ...valid,
      LLM_PROVIDER: 'openai',
      LLM_API_KEY: 'k',
      LLM_MODEL: 'gpt-5.4-mini',
    });
    expect(config.LLM_MODEL).toBe('gpt-5.4-mini');
  });

  it('refuses the mock provider in production', () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: 'production' })).toThrow(
      /must not be used in production/,
    );
  });

  it('parses a comma separated CORS allowlist', () => {
    const config = parseEnv({
      ...valid,
      FRONTEND_URL: 'https://app.example.com/, https://staging.example.com',
    });
    expect(config.allowedOrigins).toEqual([
      'https://app.example.com',
      'https://staging.example.com',
    ]);
  });

  it('rejects an out-of-range numeric setting rather than silently clamping', () => {
    expect(() => parseEnv({ ...valid, MAX_RESUME_SIZE_MB: '900' })).toThrow();
    expect(() => parseEnv({ ...valid, PORT: 'not-a-number' })).toThrow();
  });
});
