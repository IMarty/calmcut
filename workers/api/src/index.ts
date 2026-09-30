import { createApp } from './app.js'
import type { Env } from './lib/env.js'

/**
 * Point d'entrée du Worker `calmcut-api`.
 *
 * L'application est construite une fois par isolat, pas par requête : Hono compile
 * son routeur à la construction.
 */
const app = createApp()

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return app.fetch(request, env, ctx)
  },
} satisfies ExportedHandler<Env>
