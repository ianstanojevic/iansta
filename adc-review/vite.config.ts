import path from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { riotProxy } from './server/riotProxy';

export default defineConfig(({ mode }) => {
  // Loaded without the VITE_ prefix filter on purpose: the key is used only by
  // the dev-server proxy and is never exposed to client code.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    // Keep the parent project's Tailwind/PostCSS setup out of this app.
    css: { postcss: { plugins: [] } },
    plugins: [
      react(),
      riotProxy({ apiKey: env.RIOT_API_KEY, cacheDir: path.resolve(__dirname, '.cache') }),
    ],
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
