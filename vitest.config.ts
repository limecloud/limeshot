import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@business': `${root}packages/business-client/src`,
      '@codex': `${root}packages/codex-client/src`,
      '@shared': `${root}src/shared`,
      '@renderer': `${root}src/renderer/src`,
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json-summary'],
    },
  },
});
