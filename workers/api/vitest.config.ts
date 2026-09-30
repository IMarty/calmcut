import { fileURLToPath } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
import { workspaceAlias } from '../../vitest.shared.js'

/**
 * Tests d'intégration exécutés **dans workerd**, avec un vrai D1 et un vrai R2
 * fournis par Miniflare. C'est le runtime de production, pas une imitation.
 *
 * Les bindings sont déclarés ici et non repris de `wrangler.jsonc` : les tests ne
 * doivent dépendre ni d'un identifiant de base réel, ni d'un secret. Les valeurs
 * ci-dessous sont factices et le resteront.
 */
// Chemin ancré au fichier, pas au répertoire du processus : cette configuration
// est aussi chargée comme projet depuis la racine du monorepo.
const migrations = await readD1Migrations(
  fileURLToPath(new URL('../../packages/db/migrations', import.meta.url)),
)

export default defineConfig({
  // Les workspaces sont résolus vers leurs sources : ces tests ne doivent pas
  // exiger un build préalable (voir vitest.shared.ts).
  resolve: { alias: workspaceAlias },
  plugins: [
    cloudflareTest({
      // Pas d'option d'isolation de stockage : les tests remettent la base à zéro
      // eux-mêmes (`resetDatabase`), ce qui les rend lisibles isolément et
      // indépendants de la sémantique d'isolation du pool.
      miniflare: {
        compatibilityDate: '2026-08-22',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        r2Buckets: ['DATA'],
        bindings: {
          ENVIRONMENT: 'test',
          PUBLIC_ORIGIN: 'http://localhost:8787',
          JWT_SECRET: 'secret-de-test-sans-valeur-hors-des-tests',
          INGEST_TOKEN: 'ingest-de-test',
          TURNSTILE_SECRET: 'turnstile-de-test',
          TEST_MIGRATIONS: migrations,
        },
      },
    }),
  ],
  test: {
    name: 'api',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
})
