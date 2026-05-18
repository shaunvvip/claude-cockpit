import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@claude-cockpit/shared': resolve(here, './packages/shared/src'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        // Entry points — can't be unit-tested without a spawned process
        'packages/*/bin/**',
        // Build / bundler scripts
        'tools/**',
        // Route definitions — TanStack Router file-based routes; tested via integration
        'packages/dashboard/src/routes/**',
        // Vite/Tailwind/PostCSS config files
        '**/*.config.{ts,js}',
        // Test files themselves
        '**/*.test.{ts,tsx}',
        // Test setup helpers
        '**/test-setup.ts',
      ],
    },
  },
})
