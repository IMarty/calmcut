import { defineConfig } from 'drizzle-kit'

/**
 * Génération des migrations D1.
 *
 * `dialect: 'sqlite'` et `driver: 'd1-http'` ne sont pas interchangeables : on ne
 * génère ici que du SQL, appliqué par `wrangler d1 migrations apply`. Aucune
 * configuration de connexion, donc aucun secret dans ce fichier.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './migrations',
  strict: true,
  verbose: true,
})
