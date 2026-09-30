import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    // Les tests visent les sources, pas `dist` : pas de build préalable pour lancer `bun run test`.
    alias: {
      '@calmcut/core': src('core'),
      '@calmcut/sync': src('sync'),
      '@calmcut/phobias': src('phobias'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'packages/*/src/**/*.test.ts', 'workers/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      // core, sync et la logique de votes sont couverts par contrat (§14).
      thresholds: {
        'packages/core/src/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'packages/sync/src/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  },
})
