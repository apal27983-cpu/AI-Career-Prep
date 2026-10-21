import type { VitePWAOptions } from 'vite-plugin-pwa';

/**
 * PWA configuration, kept out of `vite.config.ts` so it can be asserted in
 * tests. The rule worth guarding: `/api/**` is never cached. Those responses
 * carry the signed-in user's resume text, interview answers and session state,
 * and a cached copy would outlive sign-out and could be served to the next
 * person on a shared device.
 */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  // The service worker only runs in a production build; enabling it in dev
  // makes hot reload serve stale modules.
  devOptions: { enabled: false },
  includeAssets: ['favicon-48x48.png', 'apple-touch-icon.png'],
  manifest: {
    id: '/',
    name: 'AI Career Preparation',
    short_name: 'Career Prep',
    description:
      'Analyse your resume against a target role, find your skill gaps, and practise interviews with structured AI feedback.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // The app is fully responsive, so it is not locked to one orientation.
    orientation: 'any',
    theme_color: '#4f46e5',
    background_color: '#f8fafc',
    lang: 'en',
    dir: 'ltr',
    categories: ['education', 'productivity'],
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: 'maskable-icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Resume analyzer',
        short_name: 'Resume',
        url: '/resume',
        icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Interview practice',
        short_name: 'Interview',
        url: '/interview',
        icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  },
  workbox: {
    // Precache the built shell and assets only.
    globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
    // Source maps are large and are not needed by the app at runtime.
    globIgnores: ['**/*.map'],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: true,
    // Client-side routes fall back to the shell, so a deep link such as
    // /history/<id> opens offline. API paths must never be answered with HTML.
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly',
      },
    ],
  },
};
