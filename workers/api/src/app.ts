import { Hono } from 'hono'
import type { AppBindings } from './lib/env.js'
import { fail } from './lib/http.js'
import {
  createDevVerifier,
  createTurnstileVerifier,
  type TurnstileVerifier,
} from './lib/turnstile.js'
import { deviceRoutes } from './routes/device.js'
import { ingestRoutes } from './routes/ingest.js'
import { publicRoutes } from './routes/public.js'
import { reportRoutes } from './routes/reports.js'
import { titleRoutes } from './routes/titles.js'

/**
 * API CalmCut.
 *
 * `createApp` reçoit ses dépendances externes en paramètre pour que les tests
 * d'intégration tournent sans réseau ni secret — la vérification Turnstile est la
 * seule dépendance externe, et c'est justement celle qu'on ne veut pas appeler.
 *
 * La dépendance est une **fabrique** prenant le secret, et non un vérificateur
 * déjà construit : le secret vient du binding de la requête, et le retenir dans
 * une variable partagée exposerait à une course entre requêtes du même isolat.
 */

export type VerifierFactory = (secret: string) => TurnstileVerifier

export interface AppDeps {
  readonly turnstile?: VerifierFactory
}

export const createApp = (deps: AppDeps = {}) => {
  const makeVerifier = deps.turnstile ?? createTurnstileVerifier
  const app = new Hono<AppBindings>()

  app.use('*', async (c, next) => {
    await next()
    // Une réponse de l'API n'a aucune raison d'être interprétée comme du HTML,
    // ni reniflée, ni encadrée dans une iframe.
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Frame-Options', 'DENY')
  })

  app.get('/health', (c) => c.json({ ok: true, environment: c.env.ENVIRONMENT }))

  const v1 = new Hono<AppBindings>()
  v1.route('/', deviceRoutes(makeVerifier))
  v1.route('/', publicRoutes())
  v1.route('/', titleRoutes())
  v1.route('/', reportRoutes())
  v1.route('/', ingestRoutes())

  app.route('/v1', v1)

  app.notFound((c) => fail(c, 'not-found', 'route inconnue'))
  app.onError((error, c) => {
    // On ne renvoie jamais le détail d'une erreur interne : il révélerait la forme
    // de la base. Le détail va dans les journaux du Worker.
    console.error('erreur non gérée', error)
    return c.json({ error: 'internal', message: 'erreur interne' }, 500)
  })

  return app
}

export { createDevVerifier }
