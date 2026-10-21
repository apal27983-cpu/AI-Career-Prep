import { describe, expect, it } from 'vitest';
import { pwaOptions } from '../pwa.config';

const manifest = pwaOptions.manifest as Record<string, unknown>;
const workbox = pwaOptions.workbox as Record<string, unknown>;

describe('service worker caching rules', () => {
  it('never caches API responses', () => {
    // The guard that matters: these carry resume text, interview answers and
    // session state, and a cached copy would outlive sign-out.
    const rules = workbox.runtimeCaching as Array<{
      urlPattern: (context: { url: URL }) => boolean;
      handler: string;
    }>;

    const apiRule = rules.find((rule) =>
      rule.urlPattern({ url: new URL('https://example.com/api/v1/resumes') }),
    );

    expect(apiRule).toBeDefined();
    expect(apiRule?.handler).toBe('NetworkOnly');
  });

  it('does not apply the API rule to app routes', () => {
    const rules = workbox.runtimeCaching as Array<{ urlPattern: (c: { url: URL }) => boolean }>;
    const matchesDashboard = rules.some((rule) =>
      rule.urlPattern({ url: new URL('https://example.com/dashboard') }),
    );
    expect(matchesDashboard).toBe(false);
  });

  it('never answers an API path with the SPA shell', () => {
    const denylist = workbox.navigateFallbackDenylist as RegExp[];

    expect(workbox.navigateFallback).toBe('index.html');
    expect(denylist.some((pattern) => pattern.test('/api/v1/auth/me'))).toBe(true);
    // Client routes still fall back, or deep links would 404 offline.
    expect(denylist.some((pattern) => pattern.test('/history/abc'))).toBe(false);
  });

  it('precaches the shell but not source maps', () => {
    expect(workbox.globPatterns).toContain('**/*.{js,css,html,png,svg,woff2}');
    expect(workbox.globIgnores).toContain('**/*.map');
  });

  it('replaces an old deployment rather than pinning users to it', () => {
    expect(pwaOptions.registerType).toBe('autoUpdate');
    expect(workbox.cleanupOutdatedCaches).toBe(true);
    expect(workbox.skipWaiting).toBe(true);
  });

  it('leaves the service worker off in development', () => {
    // Enabled in dev it serves stale modules through hot reload.
    expect((pwaOptions.devOptions as { enabled: boolean }).enabled).toBe(false);
  });
});

describe('web app manifest', () => {
  it('carries what a browser needs to offer installation', () => {
    expect(manifest.name).toBe('AI Career Preparation');
    expect(manifest.short_name).toBe('Career Prep');
    expect(String(manifest.short_name).length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#4f46e5');
    expect(manifest.background_color).toBeTruthy();
  });

  it('ships the icon sizes Android installation requires', () => {
    const icons = manifest.icons as Array<{ sizes: string; purpose?: string; type: string }>;
    const sizes = icons.map((icon) => icon.sizes);

    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(icons.every((icon) => icon.type === 'image/png')).toBe(true);
    // A maskable icon keeps the mark inside Android's adaptive icon mask.
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('points every icon and shortcut at a real file in public/', async () => {
    const { existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const icons = manifest.icons as Array<{ src: string }>;
    const shortcuts = (manifest.shortcuts ?? []) as Array<{ icons?: Array<{ src: string }> }>;
    const sources = [
      ...icons.map((icon) => icon.src),
      ...shortcuts.flatMap((entry) => (entry.icons ?? []).map((icon) => icon.src)),
      ...((pwaOptions.includeAssets ?? []) as string[]),
    ];

    for (const src of sources) {
      const file = resolve(import.meta.dirname, '../public', src);
      expect(existsSync(file), `missing public asset: ${src}`).toBe(true);
    }
  });

  it('keeps shortcuts pointing at routes the app actually has', () => {
    const shortcuts = manifest.shortcuts as Array<{ url: string }>;
    for (const shortcut of shortcuts) {
      expect(['/resume', '/interview']).toContain(shortcut.url);
    }
  });
});
