import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url))
const tool = (name: string) =>
  fileURLToPath(new URL(`./tools/${name}/src/index.ts`, import.meta.url))

/**
 * Deux projets, deux runtimes.
 *
 * Le projet `node` couvre les paquets, les outils et le compagnon — du code pur,
 * testable partout. Le projet `api` tourne **dans workerd**, avec un vrai D1 et un
 * vrai R2 fournis par Miniflare : c'est le seul endroit où le SQL, les contraintes
 * et les conflits d'insertion sont réellement exercés.
 *
 * `bun run test` lance les deux.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          // Les tests visent les sources, pas `dist` : pas de build préalable.
          alias: {
            '@calmcut/core': src('core'),
            '@calmcut/sync': src('sync'),
            '@calmcut/phobias': src('phobias'),
            '@calmcut/player-actions': src('player-actions'),
            '@calmcut/db': src('db'),
            '@calmcut/seed': tool('seed'),
          },
        },
        test: {
          name: 'node',
          include: [
            'tests/**/*.test.ts',
            'packages/*/src/**/*.test.ts',
            'apps/*/src/**/*.test.ts',
            'tools/*/src/**/*.test.ts',
          ],
        },
      },
      './workers/api/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/testing/**'],
      // core, sync et la logique de votes sont couverts par contrat (§14).
      thresholds: {
        'packages/core/src/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'packages/sync/src/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  },
})
