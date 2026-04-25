import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',

    // Integration tests need real infra — longer timeout
    testTimeout: 30000,
    hookTimeout: 30000,

    // Run integration test files sequentially to avoid infra conflicts
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },

    setupFiles: ['apps/ingestion/src/test-setup.integration.ts'],
    include: ['apps/*/src/**/*.integration.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
