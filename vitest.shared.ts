import { fileURLToPath } from 'node:url'

/**
 * Résolution des workspaces vers leurs **sources**, et non vers `dist`.
 *
 * Partagée par les deux projets de test. Sans elle, `bun run test` exigerait un
 * `bun run build` préalable et échouerait sur un checkout propre — ce qui s'est
 * produit trois fois : au lint à M0, au lint à M3, puis dans les tests de l'API.
 *
 * Un nouveau workspace doit être ajouté **ici** et dans les `paths` de
 * `tsconfig.eslint.json`. Vérifier avec :
 *
 *     rm -rf packages/*\/dist && bun run ci
 */
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export const workspaceAlias: Record<string, string> = {
  '@calmcut/core': at('./packages/core/src/index.ts'),
  '@calmcut/sync': at('./packages/sync/src/index.ts'),
  '@calmcut/phobias': at('./packages/phobias/src/index.ts'),
  '@calmcut/player-actions': at('./packages/player-actions/src/index.ts'),
  '@calmcut/db': at('./packages/db/src/index.ts'),
  '@calmcut/seed': at('./tools/seed/src/index.ts'),
}
