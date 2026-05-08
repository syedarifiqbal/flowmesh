import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['**/*.integration.spec.ts', '**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      thresholds: { statements: 80, branches: 80, functions: 80 },
      exclude: [
        'src/main.ts',
        '**/*.module.ts',
        '**/migrations/**',
        '**/*.dto.ts',
        '**/generated/**',
      ],
    },
  },
})
