/// <reference types="@cloudflare/workers-types" />
/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { Env } from '../src/lib/env.js'

/**
 * Typage de `env` dans les tests.
 *
 * Le pool type `cloudflare:test` via le namespace global `Cloudflare.Env` — et non
 * via `ProvidedEnv`, qui était la convention des versions précédentes. Sans cette
 * augmentation, `env` est un objet vide et le lint typé perd toute prise sur les
 * tests d'intégration.
 */
declare global {
  namespace Cloudflare {
    interface Env extends CalmCutEnv {
      readonly TEST_MIGRATIONS: D1Migration[]
    }
  }
}

type CalmCutEnv = Env
