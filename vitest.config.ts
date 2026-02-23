import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    benchmark: {
      include: ['tests/**/*.bench.ts'],
    },
    testTimeout: 30_000,
  },
});
