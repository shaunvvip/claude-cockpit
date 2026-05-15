import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  './vitest.config.ts',                   // existing root config — node env, packages/*/src/**/*.test.ts
  './packages/dashboard/vite.config.ts',  // dashboard vite config (has test: with jsdom)
])
