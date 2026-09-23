import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      'server-only': fileURLToPath(
        new URL('./tests/server-only.ts', import.meta.url),
      ),
      'next/headers': fileURLToPath(
        new URL('./tests/next-headers.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Integration tests share one real Postgres database; running files
    // concurrently risks unrelated tests racing on the same tables.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
