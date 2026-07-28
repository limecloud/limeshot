import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json-summary'],
    },
  },
});
