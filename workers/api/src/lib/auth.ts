import { devices } from '@calmcut/db'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createMiddleware } from 'hono/factory'
import type { AppBindings } from './env.js'
import { fail } from './http.js'
import { verifyDeviceToken } from './token.js'

/** Base Drizzle liée au binding D1 de la requête. */
export const dbOf = (env: AppBindings['Bindings']) => drizzle(env.DB)

const bearer = (header: string | undefined): string | undefined => {
  if (header === undefined) return undefined
  const match = /^Bearer (\S+)$/.exec(header)
  return match?.[1]
}

/**
 * Exige un jeton d'appareil valide.
 *
 * Trois vérifications, dans cet ordre, du moins coûteux au plus coûteux : la forme
 * du jeton, sa signature, puis l'état de l'appareil en base. Un appareil révoqué
 * (§8.3) porte un jeton parfaitement signé — il faut donc bien lire la base, mais
 * seulement après avoir écarté les jetons invalides.
 */
export const requireDevice = createMiddleware<AppBindings>(async (c, next) => {
  const token = bearer(c.req.header('Authorization'))
  if (token === undefined) return fail(c, 'unauthorized', 'jeton absent')

  const now = Math.floor(Date.now() / 1000)
  const result = await verifyDeviceToken(token, c.env.JWT_SECRET, now)
  if (!result.ok) return fail(c, 'unauthorized', 'jeton invalide')

  const rows = await dbOf(c.env)
    .select({ reputation: devices.reputation, revokedAt: devices.revokedAt })
    .from(devices)
    .where(eq(devices.id, result.deviceId))
    .limit(1)

  const device = rows[0]
  if (device === undefined) return fail(c, 'unauthorized', 'jeton invalide')
  if (device.revokedAt !== null) return fail(c, 'unauthorized', 'jeton invalide')

  // Rate limiting par appareil (§8.2). Le binding peut être absent en local :
  // son absence ne doit pas empêcher de développer.
  const limiter = c.env.DEVICE_LIMIT
  if (limiter !== undefined) {
    const { success } = await limiter.limit({ key: result.deviceId })
    if (!success) return fail(c, 'rate-limited', 'trop de requêtes', { 'Retry-After': '60' })
  }

  c.set('deviceId', result.deviceId)
  c.set('reputation', device.reputation)
  await next()
  return undefined
})

/**
 * Exige le jeton de service du batch.
 *
 * Comparaison en temps constant : une comparaison naïve fuite la longueur du
 * préfixe correct, ce qui suffit à retrouver un secret octet par octet.
 */
export const requireIngestToken = createMiddleware<AppBindings>(async (c, next) => {
  const token = bearer(c.req.header('Authorization'))
  if (token === undefined || !timingSafeEqual(token, c.env.INGEST_TOKEN)) {
    return fail(c, 'forbidden', "jeton d'ingestion invalide")
  }
  await next()
  return undefined
})

const timingSafeEqual = (a: string, b: string): boolean => {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  // La longueur fuite de toute façon ; le contenu, non.
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= (left[i] as number) ^ (right[i] as number)
  return diff === 0
}
