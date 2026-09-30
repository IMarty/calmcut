import { applyD1Migrations, env } from 'cloudflare:test'

// Les migrations générées par drizzle-kit sont appliquées une fois par worker de
// test : c'est le même SQL que celui qui partira en production.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
