import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base -> the built bundle works on GitHub Pages (project site),
// Vercel, Netlify and from a plain file server without reconfiguration.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
