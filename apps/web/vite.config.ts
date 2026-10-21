// `vitest/config` re-exports Vite's defineConfig and adds the `test` key.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './pwa.config';

export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
  server: {
    port: 5173,
    strictPort: true,
    // Proxying in development keeps the API same-origin, so the session cookie
    // behaves exactly as it will in production behind one domain.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET ?? 'http://localhost:4000',
        changeOrigin: false,
      },
    },
  },
  // `vite preview` serves the real build, which is the only way to exercise the
  // service worker locally - it is disabled in dev on purpose.
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET ?? 'http://localhost:4000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Recharts is the bulk of the bundle and changes rarely, so it is split
        // out to keep the app chunk small and cacheable on its own.
        manualChunks: {
          charts: ['recharts'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
  },
});
